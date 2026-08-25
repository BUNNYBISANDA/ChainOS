import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PurchaseOrderStatus, SalesOrderStatus, ShipmentDirection, ShipmentStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException, BadRequestAppException } from "../../common/errors/app-exception";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { nextDocumentNumber } from "../../common/numbering";
import { DomainEvent, ShipmentCreatedPayload, ShipmentDeliveredPayload } from "../../common/events/domain-events";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { assertShipmentTransition } from "./shipment-lifecycle";

/**
 * Owns: shipments, carriers, tracking events (manifest §2). v1 tracking is
 * manual (decisions locked, §5) — every status transition below is
 * called by a human via the API, not by a carrier webhook.
 */
@Injectable()
export class ShipmentsService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateShipmentDto) {
    const { tenantId } = this.tenantContext.get();

    const created = await withTenant(tenantId, async (tx) => {
      let destWarehouseId: string | undefined;
      let originWarehouseId: string | undefined;
      let destCustomerId: string | undefined;

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
      } else {
        if (!dto.salesOrderId) {
          throw new BadRequestAppException(
            AppErrorCode.VALIDATION_FAILED,
            "salesOrderId is required for an OUTBOUND shipment",
          );
        }
        // Reads the SalesOrder table directly via the shared tx, same
        // convention as the INBOUND branch above reading PurchaseOrder —
        // Logistics doesn't need a service dependency on Fulfillment for
        // this, just the row (manifest §1 "cross-domain reads may use
        // query composition").
        const so = await tx.salesOrder.findFirst({ where: { id: dto.salesOrderId, tenantId } });
        if (!so) throw new NotFoundAppException("Sales order not found");
        const shippableStatuses: string[] = [
          SalesOrderStatus.ALLOCATED,
          SalesOrderStatus.PARTIALLY_FULFILLED,
          SalesOrderStatus.FULFILLED,
        ];
        if (!shippableStatuses.includes(so.status)) {
          throw new BadRequestAppException(
            AppErrorCode.SALES_ORDER_INVALID_STATUS,
            `Cannot create a shipment for a sales order in ${so.status} state — it must have an active allocation`,
          );
        }
        originWarehouseId = so.warehouseId;
        destCustomerId = so.customerId;
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
      salesOrderId: shipment.salesOrderId ?? undefined,
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
}
