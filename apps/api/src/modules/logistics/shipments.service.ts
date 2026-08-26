import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  Prisma,
  PurchaseOrderStatus,
  SalesOrderStatus,
  ShipmentDirection,
  ShipmentEventType,
  ShipmentExceptionSeverity,
  ShipmentExceptionStatus,
  ShipmentExceptionType,
  ShipmentStatus,
  TrackingEventSource,
  withTenant,
  type Tx,
} from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException, BadRequestAppException } from "../../common/errors/app-exception";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { nextDocumentNumber } from "../../common/numbering";
import { DomainEvent, ShipmentCreatedPayload, ShipmentDeliveredPayload } from "../../common/events/domain-events";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { CreateShipmentEventDto } from "./dto/create-shipment-event.dto";
import { UpdateShipmentEtaDto } from "./dto/update-shipment-eta.dto";
import { assertShipmentTransition } from "./shipment-lifecycle";

const ACTIVE_STATUSES: ShipmentStatus[] = [ShipmentStatus.CREATED, ShipmentStatus.BOOKED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.ARRIVED];
const DEFAULT_STALE_HOURS = 24;

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateShipmentDto) {
    const { tenantId, userId } = this.tenantContext.get();

    const created = await withTenant(tenantId, async (tx) => {
      let destWarehouseId: string | undefined;
      let originWarehouseId: string | undefined;
      let destCustomerId: string | undefined;
      let originName: string | undefined;
      let destinationName: string | undefined;

      if (dto.direction === ShipmentDirection.INBOUND) {
        if (!dto.purchaseOrderId) {
          throw new BadRequestAppException(AppErrorCode.VALIDATION_FAILED, "purchaseOrderId is required for an INBOUND shipment");
        }
        const po = await tx.purchaseOrder.findFirst({
          where: { id: dto.purchaseOrderId, tenantId },
          include: { supplier: true, warehouse: true },
        });
        if (!po) throw new NotFoundAppException("Purchase order not found");
        if (po.status !== PurchaseOrderStatus.APPROVED) {
          throw new BadRequestAppException(
            AppErrorCode.PURCHASE_ORDER_INVALID_STATUS,
            `Cannot create a shipment for a purchase order in ${po.status} state; it must be APPROVED`,
          );
        }
        destWarehouseId = po.warehouseId;
        originName = po.supplier?.name;
        destinationName = po.warehouse?.name;
      } else {
        if (!dto.salesOrderId) {
          throw new BadRequestAppException(AppErrorCode.VALIDATION_FAILED, "salesOrderId is required for an OUTBOUND shipment");
        }
        const so = await tx.salesOrder.findFirst({
          where: { id: dto.salesOrderId, tenantId },
          include: { customer: true, warehouse: true },
        });
        if (!so) throw new NotFoundAppException("Sales order not found");
        const shippableStatuses: string[] = [
          SalesOrderStatus.ALLOCATED,
          SalesOrderStatus.PARTIALLY_FULFILLED,
          SalesOrderStatus.FULFILLED,
        ];
        if (!shippableStatuses.includes(so.status)) {
          throw new BadRequestAppException(
            AppErrorCode.SALES_ORDER_INVALID_STATUS,
            `Cannot create a shipment for a sales order in ${so.status} state; it must have an active allocation`,
          );
        }
        originWarehouseId = so.warehouseId;
        destCustomerId = so.customerId;
        originName = so.warehouse?.name;
        destinationName = so.customer?.companyName;
      }

      const shipmentNumber = await nextDocumentNumber(tx, tenantId, "SHP");
      const shipment = await tx.shipment.create({
        data: {
          tenantId,
          shipmentNumber,
          direction: dto.direction,
          purchaseOrderId: dto.purchaseOrderId,
          salesOrderId: dto.salesOrderId,
          originWarehouseId,
          destWarehouseId,
          destCustomerId,
          originName,
          destinationName,
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
          lastTrackingEventAt: new Date(),
        },
      });
      await this.appendShipmentEvent(tx, tenantId, shipment.id, {
        eventType: ShipmentEventType.CREATED,
        status: shipment.status,
        source: TrackingEventSource.SYSTEM,
        createdByUserId: userId,
      });
      return shipment;
    });

    const payload: ShipmentCreatedPayload = {
      eventId: randomUUID(),
      tenantId,
      shipmentId: created.id,
      purchaseOrderId: created.purchaseOrderId ?? undefined,
      salesOrderId: created.salesOrderId ?? undefined,
    };
    await this.events.emitAsync(DomainEvent.ShipmentCreated, payload);

    return created;
  }

  async list(
    filters: {
      status?: ShipmentStatus;
      direction?: ShipmentDirection;
      delayed?: boolean;
      exceptionStatus?: ShipmentExceptionStatus;
      needsAttention?: boolean;
      search?: string;
    } = {},
  ) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const shipments = await tx.shipment.findMany({
        where: {
          tenantId,
          status: filters.status,
          direction: filters.direction,
          shipmentNumber: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
        },
        include: {
          events: { orderBy: { eventTimestamp: "desc" }, take: 1 },
          exceptions: { where: { status: filters.exceptionStatus ?? ShipmentExceptionStatus.OPEN } },
          purchaseOrder: { include: { supplier: true } },
          salesOrder: { include: { customer: true } },
          destWarehouse: true,
          originWarehouse: true,
          destCustomer: true,
        },
        orderBy: { createdAt: "desc" },
      });

      for (const shipment of shipments) {
        await this.evaluateExceptions(tx, tenantId, shipment.id);
      }

      const refreshed = await tx.shipment.findMany({
        where: {
          tenantId,
          id: { in: shipments.map((shipment) => shipment.id) },
        },
        include: {
          events: { orderBy: { eventTimestamp: "desc" }, take: 1 },
          exceptions: { where: { status: filters.exceptionStatus ?? ShipmentExceptionStatus.OPEN } },
          purchaseOrder: { include: { supplier: true } },
          salesOrder: { include: { customer: true } },
          destWarehouse: true,
          originWarehouse: true,
          destCustomer: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return refreshed.filter((shipment) => {
        if (filters.delayed && !shipment.exceptions.some((e) => e.type === ShipmentExceptionType.ETA_EXCEEDED)) return false;
        if (filters.needsAttention && shipment.exceptions.length === 0) return false;
        return true;
      });
    });
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      await this.evaluateExceptions(tx, tenantId, id);
      const shipment = await tx.shipment.findFirst({
        where: { id, tenantId },
        include: {
          events: { orderBy: { eventTimestamp: "asc" } },
          exceptions: { orderBy: { detectedAt: "desc" } },
          purchaseOrder: { include: { supplier: true, goodsReceipts: true } },
          salesOrder: { include: { customer: true, lines: true } },
          destWarehouse: true,
          originWarehouse: true,
          destCustomer: true,
        },
      });
      if (!shipment) throw new NotFoundAppException("Shipment not found");
      return shipment;
    });
  }

  eventsForShipment(id: string) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      await this.assertShipmentExists(tx, tenantId, id);
      return tx.shipmentEvent.findMany({ where: { tenantId, shipmentId: id }, orderBy: { eventTimestamp: "asc" } });
    });
  }

  exceptionsForShipment(id: string) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      await this.evaluateExceptions(tx, tenantId, id);
      return tx.shipmentException.findMany({ where: { tenantId, shipmentId: id }, orderBy: { detectedAt: "desc" } });
    });
  }

  createManualEvent(id: string, dto: CreateShipmentEventDto) {
    const { tenantId, userId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      await this.assertShipmentExists(tx, tenantId, id);
      const event = await this.appendShipmentEvent(tx, tenantId, id, {
        eventType: dto.eventType,
        eventTimestamp: dto.eventTimestamp ? new Date(dto.eventTimestamp) : new Date(),
        locationName: dto.locationName,
        latitude: decimalOrUndefined(dto.latitude),
        longitude: decimalOrUndefined(dto.longitude),
        notes: dto.notes,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        source: TrackingEventSource.MANUAL,
        createdByUserId: userId,
      });
      await this.evaluateExceptions(tx, tenantId, id);
      return event;
    });
  }

  updateEta(id: string, dto: UpdateShipmentEtaDto) {
    const { tenantId, userId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const shipment = await this.assertShipmentExists(tx, tenantId, id);
      const previousEta = shipment.estimatedArrivalAt?.toISOString();
      const nextEta = new Date(dto.estimatedArrivalAt);
      await tx.shipment.update({ where: { id }, data: { estimatedArrivalAt: nextEta } });
      const event = await this.appendShipmentEvent(tx, tenantId, id, {
        eventType: ShipmentEventType.ETA_UPDATED,
        eventTimestamp: new Date(),
        notes: dto.notes,
        metadata: { previousEta, newEta: nextEta.toISOString() },
        source: TrackingEventSource.MANUAL,
        createdByUserId: userId,
      });
      await this.evaluateExceptions(tx, tenantId, id);
      return event;
    });
  }

  book(id: string) {
    return this.transition(id, ShipmentStatus.BOOKED);
  }

  dispatch(id: string) {
    return this.transition(id, ShipmentStatus.IN_TRANSIT);
  }

  arrive(id: string) {
    return this.transition(id, ShipmentStatus.ARRIVED);
  }

  async deliver(id: string) {
    const shipment = await this.transition(id, ShipmentStatus.DELIVERED);
    const { tenantId } = this.tenantContext.get();

    const payload: ShipmentDeliveredPayload = {
      tenantId,
      shipmentId: id,
      purchaseOrderId: shipment.purchaseOrderId ?? undefined,
      salesOrderId: shipment.salesOrderId ?? undefined,
    };
    await this.events.emitAsync(DomainEvent.ShipmentDelivered, payload);
    return shipment;
  }

  cancel(id: string) {
    return this.transition(id, ShipmentStatus.CANCELLED);
  }

  private async transition(id: string, target: ShipmentStatus, note?: string) {
    const { tenantId, userId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const shipment = await this.assertShipmentExists(tx, tenantId, id);
      assertShipmentTransition(shipment.status, target);

      const now = new Date();
      const data: Prisma.ShipmentUpdateInput = { status: target };
      if (target === ShipmentStatus.IN_TRANSIT) data.actualDepartureAt = shipment.actualDepartureAt ?? now;
      if (target === ShipmentStatus.ARRIVED || target === ShipmentStatus.DELIVERED) data.actualArrivalAt = shipment.actualArrivalAt ?? now;
      if (target === ShipmentStatus.DELIVERED) data.deliveredAt = now;

      const updated = await tx.shipment.update({ where: { id }, data });
      await this.appendShipmentEvent(tx, tenantId, id, {
        eventType: eventTypeForStatus(target),
        status: target,
        eventTimestamp: now,
        notes: note,
        source: TrackingEventSource.SYSTEM,
        createdByUserId: userId,
      });
      await this.evaluateExceptions(tx, tenantId, id);
      return updated;
    });
  }

  private async appendShipmentEvent(
    tx: Tx,
    tenantId: string,
    shipmentId: string,
    input: {
      eventType: ShipmentEventType;
      status?: ShipmentStatus;
      eventTimestamp?: Date;
      locationName?: string;
      latitude?: Prisma.Decimal;
      longitude?: Prisma.Decimal;
      source: TrackingEventSource;
      notes?: string;
      metadata?: Prisma.InputJsonValue;
      createdByUserId?: string;
    },
  ) {
    const eventTimestamp = input.eventTimestamp ?? new Date();
    const event = await tx.shipmentEvent.create({
      data: {
        tenantId,
        shipmentId,
        status: input.status,
        eventType: input.eventType,
        eventTimestamp,
        occurredAt: eventTimestamp,
        locationName: input.locationName,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source,
        note: input.notes,
        notes: input.notes,
        metadata: input.metadata,
        createdByUserId: input.createdByUserId,
      },
    });

    const shipmentPatch: Prisma.ShipmentUpdateInput = { lastTrackingEventAt: eventTimestamp };
    if (input.locationName || input.latitude || input.longitude) {
      shipmentPatch.currentLocationName = input.locationName;
      shipmentPatch.currentLatitude = input.latitude;
      shipmentPatch.currentLongitude = input.longitude;
    }
    await tx.shipment.update({ where: { id: shipmentId }, data: shipmentPatch });

    return event;
  }

  private async evaluateExceptions(tx: Tx, tenantId: string, shipmentId: string) {
    const shipment = await this.assertShipmentExists(tx, tenantId, shipmentId);
    const active = ACTIVE_STATUSES.includes(shipment.status);

    if (!active) {
      await this.resolveOpenException(tx, tenantId, shipmentId, ShipmentExceptionType.ETA_EXCEEDED);
      await this.resolveOpenException(tx, tenantId, shipmentId, ShipmentExceptionType.TRACKING_STALE);
      return;
    }

    const now = new Date();
    if (shipment.estimatedArrivalAt && now.getTime() > shipment.estimatedArrivalAt.getTime()) {
      const delayedByMinutes = Math.floor((now.getTime() - shipment.estimatedArrivalAt.getTime()) / 60000);
      await this.openException(tx, tenantId, shipmentId, {
        type: ShipmentExceptionType.ETA_EXCEEDED,
        severity: delayedByMinutes >= 24 * 60 ? ShipmentExceptionSeverity.CRITICAL : ShipmentExceptionSeverity.WARNING,
        message: `Estimated arrival was exceeded by ${delayedByMinutes} minute${delayedByMinutes === 1 ? "" : "s"}.`,
        metadata: { estimatedArrivalAt: shipment.estimatedArrivalAt.toISOString(), delayedByMinutes },
      });
    } else {
      await this.resolveOpenException(tx, tenantId, shipmentId, ShipmentExceptionType.ETA_EXCEEDED);
    }

    const staleThresholdHours = Number(process.env.SHIPMENT_STALE_HOURS ?? DEFAULT_STALE_HOURS);
    const lastUpdate = shipment.lastTrackingEventAt ?? shipment.createdAt;
    const staleByMinutes = Math.floor((now.getTime() - lastUpdate.getTime()) / 60000);
    if (staleByMinutes > staleThresholdHours * 60) {
      await this.openException(tx, tenantId, shipmentId, {
        type: ShipmentExceptionType.TRACKING_STALE,
        severity: ShipmentExceptionSeverity.WARNING,
        message: `No tracking update for more than ${staleThresholdHours} hours.`,
        metadata: { lastTrackingEventAt: lastUpdate.toISOString(), staleThresholdHours },
      });
    } else {
      await this.resolveOpenException(tx, tenantId, shipmentId, ShipmentExceptionType.TRACKING_STALE);
    }
  }

  private async openException(
    tx: Tx,
    tenantId: string,
    shipmentId: string,
    input: {
      type: ShipmentExceptionType;
      severity: ShipmentExceptionSeverity;
      message: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const existing = await tx.shipmentException.findFirst({
      where: { tenantId, shipmentId, type: input.type, status: ShipmentExceptionStatus.OPEN },
    });
    if (existing) {
      await tx.shipmentException.update({
        where: { id: existing.id },
        data: { severity: input.severity, message: input.message, metadata: input.metadata },
      });
      return;
    }
    await tx.shipmentException.create({
      data: { tenantId, shipmentId, type: input.type, severity: input.severity, message: input.message, metadata: input.metadata },
    });
  }

  private async resolveOpenException(tx: Tx, tenantId: string, shipmentId: string, type: ShipmentExceptionType) {
    await tx.shipmentException.updateMany({
      where: { tenantId, shipmentId, type, status: ShipmentExceptionStatus.OPEN },
      data: { status: ShipmentExceptionStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  private async assertShipmentExists(tx: Tx, tenantId: string, id: string) {
    const shipment = await tx.shipment.findFirst({ where: { id, tenantId } });
    if (!shipment) throw new NotFoundAppException("Shipment not found");
    return shipment;
  }
}

function eventTypeForStatus(status: ShipmentStatus): ShipmentEventType {
  if (status === ShipmentStatus.IN_TRANSIT) return ShipmentEventType.DISPATCHED;
  return status as unknown as ShipmentEventType;
}

function decimalOrUndefined(value: string | undefined): Prisma.Decimal | undefined {
  if (value === undefined || value === "") return undefined;
  return new Prisma.Decimal(value);
}
