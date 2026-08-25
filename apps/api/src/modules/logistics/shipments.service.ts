import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { PurchaseOrderStatus, ShipmentDirection, ShipmentStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException, BadRequestAppException } from "../../common/errors/app-exception";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { nextDocumentNumber } from "../../common/numbering";
import { DomainEvent, OrderReadyPayload, ShipmentCreatedPayload, ShipmentDeliveredPayload } from "../../common/events/domain-events";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { assertShipmentTransition } from "./shipment-lifecycle";

/**
 * Owns: shipments, carriers, tracking events (manifest §2). v1 tracking is
 * manual (decisions locked, §5) — every status transition below is
 * called by a human via the API, not by a carrier webhook.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateShipmentDto) {
    const { tenantId } = this.tenantContext.get();

    const created = await withTenant(tenantId, async (tx) => {
      let destWarehouseId = dto.destWarehouseId;

      if (dto.direction === ShipmentDirection.INBOUND) {
        if (!dto.purchaseOrderId) {
          throw new BadRequestAppException(
            AppErrorCode.VALIDATION_FAILED,
            "purchaseOrderId is required for an INBOUND shipment",
          );
        }
        const po = await tx.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, tenantId } });
        if (!po) throw new NotFoundAppException("Purchase order not found");
        if (po.status !== PurchaseOrderStatus.APPROVED) {
          throw new BadRequestAppException(
            AppErrorCode.PURCHASE_ORDER_INVALID_STATUS,
            `Cannot create a shipment for a purchase order in ${po.status} state — it must be APPROVED`,
          );
        }
        destWarehouseId = po.warehouseId;
      }

      const shipmentNumber = await nextDocumentNumber(tx, tenantId, "SHP");
      const shipment = await tx.shipment.create({
        data: {
          tenantId,
          shipmentNumber,
          direction: dto.direction,
          purchaseOrderId: dto.purchaseOrderId,
          customerOrderId: dto.customerOrderId,
          originWarehouseId: dto.originWarehouseId,
          destWarehouseId,
          carrier: dto.carrier,
          trackingNumber: dto.trackingNumber,
        },
      });
      await tx.shipmentEvent.create({ data: { tenantId, shipmentId: shipment.id, status: shipment.status } });
      return shipment;
    });

    if (created.purchaseOrderId) {
      const payload: ShipmentCreatedPayload = {
        eventId: randomUUID(),
        tenantId,
        shipmentId: created.id,
        purchaseOrderId: created.purchaseOrderId,
      };
      await this.events.emitAsync(DomainEvent.ShipmentCreated, payload);
    }

    return created;
  }

  list(filters: { status?: ShipmentStatus; direction?: ShipmentDirection } = {}) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.shipment.findMany({
        where: { tenantId, status: filters.status, direction: filters.direction },
        include: { events: true, purchaseOrder: true, destWarehouse: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const shipment = await withTenant(tenantId, (tx) =>
      tx.shipment.findFirst({
        where: { id, tenantId },
        include: {
          events: { orderBy: { occurredAt: "asc" } },
          purchaseOrder: { include: { supplier: true } },
          destWarehouse: true,
          originWarehouse: true,
        },
      }),
    );
    if (!shipment) throw new NotFoundAppException("Shipment not found");
    return shipment;
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
      customerOrderId: shipment.customerOrderId ?? undefined,
    };
    await this.events.emitAsync(DomainEvent.ShipmentDelivered, payload);
    return shipment;
  }

  cancel(id: string) {
    return this.transition(id, ShipmentStatus.CANCELLED);
  }

  private async transition(id: string, target: ShipmentStatus, note?: string) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const shipment = await tx.shipment.findFirst({ where: { id, tenantId } });
      if (!shipment) throw new NotFoundAppException("Shipment not found");
      assertShipmentTransition(shipment.status, target);

      const updated = await tx.shipment.update({ where: { id }, data: { status: target } });
      await tx.shipmentEvent.create({ data: { tenantId, shipmentId: id, status: target, note } });
      return updated;
    });
  }

  @OnEvent(DomainEvent.OrderReady)
  onOrderReady(payload: OrderReadyPayload) {
    // Placeholder: phase 1 ships this as a manual "create shipment" call
    // (see decisions locked, §5). Auto-creating an outbound Shipment here
    // is the natural phase-1.5 follow-up once manual tracking is proven out.
    this.logger.debug(`order.ready observed for customer order ${payload.customerOrderId} — shipment creation is manual in v1`);
  }
}
