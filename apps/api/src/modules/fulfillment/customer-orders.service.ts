import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { CustomerOrderStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException, NotFoundAppException } from "../../common/errors/app-exception";
import {
  DomainEvent,
  OrderReadyPayload,
  OrderReservedPayload,
  ShipmentDeliveredPayload,
  StockChangedPayload,
} from "../../common/events/domain-events";
import { CreateCustomerOrderDto } from "./dto/create-customer-order.dto";

/** Owns: customer orders, order lines, reservations (manifest §2). */
@Injectable()
export class CustomerOrdersService {
  private readonly logger = new Logger(CustomerOrdersService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
  ) {}

  create(dto: CreateCustomerOrderDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.customerOrder.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          lines: {
            create: dto.lines.map((l) => ({ tenantId, productId: l.productId, qtyOrdered: l.qtyOrdered })),
          },
        },
        include: { lines: true },
      }),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.customerOrder.findMany({ where: { tenantId }, include: { lines: true } }));
  }

  /** Reserves stock for every line on the order. Inventory validates availability and may reject. */
  async reserve(customerOrderId: string) {
    const { tenantId } = this.tenantContext.get();
    const order = await withTenant(tenantId, async (tx) => {
      const found = await tx.customerOrder.findFirst({ where: { id: customerOrderId, tenantId }, include: { lines: true } });
      if (!found) throw new NotFoundAppException("Customer order not found");
      if (found.status !== CustomerOrderStatus.DRAFT) {
        throw new BadRequestAppException(
          AppErrorCode.CUSTOMER_ORDER_INVALID_STATUS,
          `Customer order cannot be reserved from ${found.status} state`,
        );
      }
      await tx.customerOrder.update({ where: { id: customerOrderId }, data: { status: CustomerOrderStatus.RESERVED } });
      return found;
    });

    const payload: OrderReservedPayload = {
      eventId: randomUUID(),
      tenantId,
      customerOrderId,
      warehouseId: order.warehouseId,
      lines: order.lines.map((l) => ({ customerOrderLineId: l.id, productId: l.productId, qty: l.qtyOrdered })),
    };
    await this.events.emitAsync(DomainEvent.OrderReserved, payload);
    return payload;
  }

  /** Marks the order ready to ship, releasing the reservation into a fulfillment movement (see InventoryService). */
  async ready(customerOrderId: string) {
    const { tenantId } = this.tenantContext.get();
    const order = await withTenant(tenantId, async (tx) => {
      const found = await tx.customerOrder.findFirst({ where: { id: customerOrderId, tenantId }, include: { lines: true } });
      if (!found) throw new NotFoundAppException("Customer order not found");
      if (found.status !== CustomerOrderStatus.RESERVED) {
        throw new BadRequestAppException(
          AppErrorCode.CUSTOMER_ORDER_INVALID_STATUS,
          `Customer order cannot be marked ready from ${found.status} state`,
        );
      }
      await tx.customerOrder.update({ where: { id: customerOrderId }, data: { status: CustomerOrderStatus.READY_TO_SHIP } });
      return found;
    });

    const payload: OrderReadyPayload = {
      eventId: randomUUID(),
      tenantId,
      customerOrderId,
      warehouseId: order.warehouseId,
      lines: order.lines.map((l) => ({ customerOrderLineId: l.id, productId: l.productId, qty: l.qtyOrdered })),
    };
    await this.events.emitAsync(DomainEvent.OrderReady, payload);
    return payload;
  }

  @OnEvent(DomainEvent.StockChanged)
  onStockChanged(payload: StockChangedPayload) {
    // Placeholder: once backorder handling exists, check whether any DRAFT
    // order lines for payload.productId/warehouseId can now be reserved.
    this.logger.debug(`stock.changed observed for product ${payload.productId} (onHand=${payload.quantityOnHand})`);
  }

  @OnEvent(DomainEvent.ShipmentDelivered)
  async onShipmentDelivered(payload: ShipmentDeliveredPayload) {
    if (!payload.customerOrderId) return;
    await withTenant(payload.tenantId, (tx) =>
      tx.customerOrder.update({
        where: { id: payload.customerOrderId! },
        data: { status: CustomerOrderStatus.DELIVERED },
      }),
    );
  }
}
