import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SalesOrderStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException, NotFoundAppException } from "../../common/errors/app-exception";
import { nextDocumentNumber } from "../../common/numbering";
import { DomainEvent, SalesOrderAllocatedPayload, SalesOrderFulfilledPayload } from "../../common/events/domain-events";
import { InventoryService } from "../inventory/inventory.service";
import { CreateSalesOrderDto } from "./dto/create-sales-order.dto";
import { FulfillSalesOrderDto } from "./dto/fulfill-sales-order.dto";
import { FULFILLABLE_STATUSES, assertSalesOrderTransition } from "./sales-order-lifecycle";

/**
 * Owns: sales orders, order lines (manifest, phase 2 outbound slice — see
 * docs/adr/0005-inventory-reservation-model.md). Publishes
 * sales-order.allocated, sales-order.fulfilled. Reservation and release
 * are synchronous calls into InventoryService, not events — see
 * docs/adr/0006-reservation-concurrency-strategy.md for why.
 */
@Injectable()
export class SalesOrdersService {
  private readonly logger = new Logger(SalesOrdersService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  create(dto: CreateSalesOrderDto) {
    const { tenantId, userId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const orderNumber = await nextDocumentNumber(tx, tenantId, "SO");
      return tx.salesOrder.create({
        data: {
          tenantId,
          orderNumber,
          customerId: dto.customerId,
          warehouseId: dto.warehouseId,
          currency: dto.currency ?? "THB",
          notes: dto.notes,
          requestedDeliveryDate: dto.requestedDeliveryDate ? new Date(dto.requestedDeliveryDate) : undefined,
          createdByUserId: userId,
          status: SalesOrderStatus.DRAFT,
          lines: {
            create: dto.lines.map((l) => ({
              tenantId,
              productId: l.productId,
              qtyOrdered: l.qtyOrdered,
              unitPrice: l.unitPrice,
            })),
          },
        },
        include: { lines: true, customer: true, warehouse: true },
      });
    });
  }

  list(filters: { status?: SalesOrderStatus; customerId?: string; warehouseId?: string } = {}) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.salesOrder.findMany({
        where: {
          tenantId,
          status: filters.status,
          customerId: filters.customerId,
          warehouseId: filters.warehouseId,
        },
        include: { lines: true, customer: true, warehouse: true, shipment: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const order = await withTenant(tenantId, (tx) =>
      tx.salesOrder.findFirst({
        where: { id, tenantId },
        include: {
          lines: { include: { product: true, reservation: true } },
          customer: true,
          warehouse: true,
          shipment: true,
        },
      }),
    );
    if (!order) throw new NotFoundAppException("Sales order not found");

    const lines = order.lines.map((line) => ({
      ...line,
      remaining: line.qtyOrdered - line.qtyFulfilled,
      lineTotal: line.qtyOrdered * Number(line.unitPrice),
    }));

    return {
      ...order,
      lines,
      totalValue: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    };
  }

  /** Commercial acceptance — no inventory involvement. Only Sales Manager/Admin can confirm ("sales-order:confirm" on the route). */
  async confirm(id: string) {
    const { tenantId, userId } = this.tenantContext.get();
    const updated = await withTenant(tenantId, async (tx) => {
      const order = await tx.salesOrder.findFirst({ where: { id, tenantId } });
      if (!order) throw new NotFoundAppException("Sales order not found");
      assertSalesOrderTransition(order.status, SalesOrderStatus.CONFIRMED);

      const result = await tx.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.CONFIRMED, confirmedByUserId: userId, confirmedAt: new Date() },
      });
      await this.audit.record(tx, tenantId, {
        userId,
        action: "sales_order.confirm",
        entityType: "SalesOrder",
        entityId: id,
        metadata: { orderNumber: order.orderNumber },
      });
      return result;
    });
    return updated;
  }

  /**
   * Reserves stock for every line, all-or-nothing, in one transaction —
   * never marks ALLOCATED unless every line's reservation succeeded (see
   * docs/adr/0006). Lines are locked in productId order to avoid
   * deadlocking against a concurrent allocation on the same products.
   */
  async allocate(id: string) {
    const { tenantId } = this.tenantContext.get();

    const { order, changes, allocatedLines } = await withTenant(tenantId, async (tx) => {
      const found = await tx.salesOrder.findFirst({ where: { id, tenantId }, include: { lines: true } });
      if (!found) throw new NotFoundAppException("Sales order not found");
      assertSalesOrderTransition(found.status, SalesOrderStatus.ALLOCATED);

      const sortedLines = [...found.lines].sort((a, b) => a.productId.localeCompare(b.productId));
      const changes: Array<{ productId: string; warehouseId: string; level: { quantityOnHand: number; quantityReserved: number } }> = [];
      const allocatedLines: SalesOrderAllocatedPayload["lines"] = [];

      for (const line of sortedLines) {
        const level = await this.inventory.reserveForSalesOrder(tx, tenantId, {
          salesOrderId: id,
          salesOrderLineId: line.id,
          productId: line.productId,
          warehouseId: found.warehouseId,
          quantity: line.qtyOrdered,
        });
        await tx.salesOrderLine.update({ where: { id: line.id }, data: { qtyReserved: line.qtyOrdered } });
        changes.push({ productId: line.productId, warehouseId: found.warehouseId, level });
        allocatedLines.push({ salesOrderLineId: line.id, productId: line.productId, qty: line.qtyOrdered });
      }

      const updated = await tx.salesOrder.update({ where: { id }, data: { status: SalesOrderStatus.ALLOCATED } });
      return { order: updated, changes, allocatedLines };
    });

    for (const change of changes) {
      await this.inventory.emitStockChanged(tenantId, change.productId, change.warehouseId, change.level);
    }

    const payload: SalesOrderAllocatedPayload = {
      eventId: randomUUID(),
      tenantId,
      salesOrderId: id,
      warehouseId: order.warehouseId,
      lines: allocatedLines,
    };
    await this.events.emitAsync(DomainEvent.SalesOrderAllocated, payload);

    return this.get(id);
  }

  /**
   * Cancelling before any fulfillment releases the full reservation;
   * cancelling from PARTIALLY_FULFILLED releases only the unfulfilled
   * remainder per line (fulfilled history is untouched) — see
   * docs/adr/0007. No StockMovement is ever created for a release.
   */
  async cancel(id: string) {
    const { tenantId, userId } = this.tenantContext.get();

    const { order, changes } = await withTenant(tenantId, async (tx) => {
      const found = await tx.salesOrder.findFirst({ where: { id, tenantId } });
      if (!found) throw new NotFoundAppException("Sales order not found");
      assertSalesOrderTransition(found.status, SalesOrderStatus.CANCELLED);

      const hadAllocation =
        found.status === SalesOrderStatus.ALLOCATED || found.status === SalesOrderStatus.PARTIALLY_FULFILLED;

      const changes = hadAllocation ? await this.inventory.releaseReservationsForSalesOrder(tx, tenantId, id) : [];
      if (hadAllocation) {
        await tx.salesOrderLine.updateMany({ where: { salesOrderId: id, tenantId }, data: { qtyReserved: 0 } });
      }

      const updated = await tx.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.CANCELLED, cancelledAt: new Date() },
      });
      await this.audit.record(tx, tenantId, {
        userId,
        action: "sales_order.cancel",
        entityType: "SalesOrder",
        entityId: id,
        metadata: { orderNumber: found.orderNumber, fromStatus: found.status },
      });
      return { order: updated, changes };
    });

    for (const change of changes) {
      await this.inventory.emitStockChanged(tenantId, change.productId, change.warehouseId, change.level);
    }
    return order;
  }

  /**
   * Physical fulfillment. Validates and commits the SalesOrderLine
   * qtyReserved/qtyFulfilled deltas atomically (a single conditional
   * `updateMany` per line — see docs/adr/0007), then emits
   * sales-order.fulfilled so InventoryService can post the ledger
   * movement. Over-fulfillment is rejected before any event exists.
   */
  async fulfill(id: string, dto: FulfillSalesOrderDto) {
    const { tenantId } = this.tenantContext.get();

    const result = await withTenant(tenantId, async (tx) => {
      const order = await tx.salesOrder.findFirst({ where: { id, tenantId }, include: { lines: true } });
      if (!order) throw new NotFoundAppException("Sales order not found");
      if (!FULFILLABLE_STATUSES.includes(order.status)) {
        throw new BadRequestAppException(
          AppErrorCode.SALES_ORDER_INVALID_STATUS,
          `Sales order cannot be fulfilled from ${order.status} state`,
        );
      }

      const eventLines: SalesOrderFulfilledPayload["lines"] = [];
      for (const request of dto.lines) {
        const line = order.lines.find((l) => l.id === request.salesOrderLineId);
        if (!line) {
          throw new BadRequestAppException(
            AppErrorCode.SALES_ORDER_LINE_UNKNOWN,
            `Unknown sales order line ${request.salesOrderLineId}`,
          );
        }

        const updateResult = await tx.salesOrderLine.updateMany({
          where: { id: line.id, tenantId, qtyReserved: { gte: request.qty } },
          data: { qtyReserved: { decrement: request.qty }, qtyFulfilled: { increment: request.qty } },
        });
        if (updateResult.count === 0) {
          throw new BadRequestAppException(
            AppErrorCode.SALES_ORDER_OVER_FULFILLMENT,
            `Fulfilling ${request.qty} on line ${line.id} would exceed the reserved quantity (${line.qtyReserved} reserved)`,
            { salesOrderLineId: line.id, requested: request.qty, remaining: line.qtyReserved },
          );
        }

        eventLines.push({ salesOrderLineId: line.id, productId: line.productId, qty: request.qty });
      }

      const refreshedLines = await tx.salesOrderLine.findMany({ where: { salesOrderId: id } });
      const fullyFulfilled = refreshedLines.every((l) => l.qtyFulfilled >= l.qtyOrdered);
      const status = fullyFulfilled ? SalesOrderStatus.FULFILLED : SalesOrderStatus.PARTIALLY_FULFILLED;

      await tx.salesOrder.update({ where: { id }, data: { status } });

      return { warehouseId: order.warehouseId, eventLines };
    });

    const payload: SalesOrderFulfilledPayload = {
      eventId: randomUUID(),
      tenantId,
      salesOrderId: id,
      warehouseId: result.warehouseId,
      lines: result.eventLines,
    };
    await this.events.emitAsync(DomainEvent.SalesOrderFulfilled, payload);

    return this.get(id);
  }
}
