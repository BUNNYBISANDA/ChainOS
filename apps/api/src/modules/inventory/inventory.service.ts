import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Prisma, ReservationStatus, StockMovementType, Tx, withTenant } from "@chainos/database";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException } from "../../common/errors/app-exception";
import { claimEvent } from "../../common/events/claim-event";
import {
  DomainEvent,
  PoReceivedPayload,
  SalesOrderFulfilledPayload,
  StockChangedPayload,
} from "../../common/events/domain-events";

interface StockLevelResult {
  quantityOnHand: number;
  quantityReserved: number;
}

/**
 * Owns the inventory ledger. This is the only module allowed to write
 * StockLevel/StockMovement/InventoryReservation rows — everyone else gets
 * there by emitting po.received / sales-order.fulfilled and reacting to
 * stock.changed, OR (reservation only — see docs/adr/0006) by calling
 * reserveForSalesOrder()/releaseReservationsForSalesOrder() directly,
 * passing the caller's own transaction (manifest §1 "inventory is a
 * ledger" + §2 module table).
 *
 * Idempotency: every async event handler here claims its `eventId` in
 * `ProcessedEvent` inside the same transaction as the ledger write it
 * guards. A duplicate delivery of the same event (retry, at-least-once
 * redelivery) loses the unique-constraint race and no-ops instead of
 * double-applying — see domain-events.ts for the contract this relies on.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly events: EventEmitter2) {}

  @OnEvent(DomainEvent.PoReceived)
  async handlePoReceived(payload: PoReceivedPayload) {
    const changes = await withTenant(payload.tenantId, async (tx) => {
      const claimed = await claimEvent(tx, payload.tenantId, payload.eventId, DomainEvent.PoReceived);
      if (!claimed) {
        this.logger.debug(`po.received ${payload.eventId} already processed for PO ${payload.purchaseOrderId} — skipping`);
        return [];
      }

      this.logger.debug(`po.received ${payload.eventId} -> posting ${payload.lines.length} receipt(s) for PO ${payload.purchaseOrderId}`);
      const results: Array<{ productId: string; warehouseId: string; level: StockLevelResult }> = [];
      for (const line of payload.lines) {
        const level = await this.postMovement(tx, payload.tenantId, {
          productId: line.productId,
          warehouseId: payload.warehouseId,
          type: StockMovementType.RECEIPT,
          quantityDelta: line.qtyReceived,
          purchaseOrderLineId: line.purchaseOrderLineId,
          goodsReceiptLineId: line.goodsReceiptLineId,
        });
        results.push({ productId: line.productId, warehouseId: payload.warehouseId, level });
      }
      return results;
    });

    for (const change of changes) {
      await this.emitStockChanged(payload.tenantId, change.productId, change.warehouseId, change.level);
    }
  }

  /**
   * Reserves stock for one SalesOrderLine — called synchronously, in the
   * SAME transaction as SalesOrdersService.allocate()'s status update (see
   * docs/adr/0006-reservation-concurrency-strategy.md for why this is a
   * direct call, not an async event, unlike every other cross-module
   * interaction in this codebase). Callers MUST process a multi-line
   * order's lines sorted by productId to avoid deadlocking against a
   * concurrent allocation touching the same products in a different order.
   *
   * `SELECT ... FOR UPDATE` locks the StockLevel row before the
   * availability check, closing the read-then-write race the phase 1
   * `handleOrderReserved` had (a plain `findFirst` + `increment` with no
   * lock in between). If insufficient, throws — the caller's transaction
   * rolls back, undoing any reservations already made for earlier lines in
   * the same allocate() call (true all-or-nothing, no compensation code).
   */
  async reserveForSalesOrder(
    tx: Tx,
    tenantId: string,
    args: { salesOrderId: string; salesOrderLineId: string; productId: string; warehouseId: string; quantity: number },
  ): Promise<StockLevelResult> {
    const rows = await tx.$queryRaw<Array<{ id: string; quantityOnHand: number; quantityReserved: number }>>`
      SELECT "id", "quantityOnHand", "quantityReserved" FROM "stock_levels"
      WHERE "tenantId" = ${tenantId} AND "productId" = ${args.productId} AND "warehouseId" = ${args.warehouseId} AND "locationId" IS NULL
      FOR UPDATE
    `;
    const row = rows[0];
    const onHand = row?.quantityOnHand ?? 0;
    const reserved = row?.quantityReserved ?? 0;
    const available = onHand - reserved;

    if (available < args.quantity) {
      throw new BadRequestAppException(
        AppErrorCode.INVENTORY_INSUFFICIENT_AVAILABLE_STOCK,
        `Cannot reserve ${args.quantity} of product ${args.productId} at warehouse ${args.warehouseId}: only ${available} available`,
        { productId: args.productId, warehouseId: args.warehouseId, requested: args.quantity, available },
      );
    }

    const level = await tx.stockLevel.update({
      where: { id: row!.id },
      data: { quantityReserved: { increment: args.quantity } },
    });

    await tx.inventoryReservation.create({
      data: {
        tenantId,
        salesOrderId: args.salesOrderId,
        salesOrderLineId: args.salesOrderLineId,
        productId: args.productId,
        warehouseId: args.warehouseId,
        quantity: args.quantity,
        status: ReservationStatus.ACTIVE,
      },
    });

    return level;
  }

  /**
   * Releases every ACTIVE reservation for a SalesOrder — the unfulfilled
   * remainder only (`quantity - fulfilledQuantity`), so a partial
   * cancellation after a partial fulfillment keeps the fulfilled portion's
   * history intact (see docs/adr/0007). No StockMovement is created —
   * releasing a reservation is not a physical movement. Safe without a row
   * lock: the decrement amount is derived from the reservation row itself,
   * not from re-reading and reasoning about the current StockLevel value,
   * so there's no read-then-decide window to race (see ADR 0006).
   */
  async releaseReservationsForSalesOrder(
    tx: Tx,
    tenantId: string,
    salesOrderId: string,
  ): Promise<Array<{ productId: string; warehouseId: string; level: StockLevelResult }>> {
    const reservations = await tx.inventoryReservation.findMany({
      where: { tenantId, salesOrderId, status: ReservationStatus.ACTIVE },
    });

    const results: Array<{ productId: string; warehouseId: string; level: StockLevelResult }> = [];
    for (const reservation of reservations) {
      const remaining = reservation.quantity - reservation.fulfilledQuantity;
      if (remaining > 0) {
        const level = await this.upsertWarehouseStockLevel(tx, tenantId, reservation.productId, reservation.warehouseId, {
          update: { quantityReserved: { decrement: remaining } },
          create: {},
        });
        results.push({ productId: reservation.productId, warehouseId: reservation.warehouseId, level });
      }
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CANCELLED, releasedAt: new Date() },
      });
    }
    return results;
  }

  /**
   * Applies fulfillment deltas that SalesOrdersService.fulfill() already
   * validated and committed against SalesOrderLine.qtyReserved/qtyFulfilled
   * (see docs/adr/0007) — this handler's only job is posting the ledger
   * movement and updating the matching InventoryReservation, exactly once
   * per eventId. Over-fulfillment is not re-checked here: it was already
   * proven legal atomically before this event was even emitted.
   */
  @OnEvent(DomainEvent.SalesOrderFulfilled)
  async handleSalesOrderFulfilled(payload: SalesOrderFulfilledPayload) {
    const changes = await withTenant(payload.tenantId, async (tx) => {
      const claimed = await claimEvent(tx, payload.tenantId, payload.eventId, DomainEvent.SalesOrderFulfilled);
      if (!claimed) {
        this.logger.debug(`sales-order.fulfilled ${payload.eventId} already processed for order ${payload.salesOrderId} — skipping`);
        return [];
      }

      const results: Array<{ productId: string; warehouseId: string; level: StockLevelResult }> = [];
      for (const line of payload.lines) {
        const level = await this.postMovement(tx, payload.tenantId, {
          productId: line.productId,
          warehouseId: payload.warehouseId,
          type: StockMovementType.FULFILLMENT,
          quantityDelta: -line.qty,
          salesOrderLineId: line.salesOrderLineId,
          releaseReservedQty: line.qty,
        });

        const reservation = await tx.inventoryReservation.update({
          where: { salesOrderLineId: line.salesOrderLineId },
          data: { fulfilledQuantity: { increment: line.qty } },
        });
        if (reservation.fulfilledQuantity >= reservation.quantity) {
          await tx.inventoryReservation.update({
            where: { id: reservation.id },
            data: { status: ReservationStatus.FULFILLED },
          });
        }

        results.push({ productId: line.productId, warehouseId: payload.warehouseId, level });
      }
      return results;
    });

    for (const change of changes) {
      await this.emitStockChanged(payload.tenantId, change.productId, change.warehouseId, change.level);
    }
  }

  listStockLevels(tenantId: string, filters: { warehouseId?: string; productId?: string } = {}) {
    return withTenant(tenantId, (tx) =>
      tx.stockLevel.findMany({
        where: {
          tenantId,
          warehouseId: filters.warehouseId,
          productId: filters.productId,
        },
        include: { product: true, warehouse: true },
        orderBy: [{ product: { sku: "asc" } }],
      }),
    );
  }

  /** Immutable movement history for one product+warehouse — the ledger drill-down. */
  listMovements(tenantId: string, filters: { productId?: string; warehouseId?: string } = {}) {
    return withTenant(tenantId, (tx) =>
      tx.stockMovement.findMany({
        where: {
          tenantId,
          productId: filters.productId,
          warehouseId: filters.warehouseId,
        },
        include: { product: true, warehouse: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  /** Posts one ledger row and updates the materialized StockLevel in the same transaction. */
  private async postMovement(
    tx: Tx,
    tenantId: string,
    args: {
      productId: string;
      warehouseId: string;
      type: StockMovementType;
      quantityDelta: number;
      purchaseOrderLineId?: string;
      goodsReceiptLineId?: string;
      salesOrderLineId?: string;
      releaseReservedQty?: number;
    },
  ): Promise<StockLevelResult> {
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId: args.productId,
        warehouseId: args.warehouseId,
        type: args.type,
        quantityDelta: args.quantityDelta,
        purchaseOrderLineId: args.purchaseOrderLineId,
        goodsReceiptLineId: args.goodsReceiptLineId,
        salesOrderLineId: args.salesOrderLineId,
      },
    });

    return this.upsertWarehouseStockLevel(tx, tenantId, args.productId, args.warehouseId, {
      update: {
        quantityOnHand: { increment: args.quantityDelta },
        ...(args.releaseReservedQty ? { quantityReserved: { decrement: args.releaseReservedQty } } : {}),
      },
      create: { quantityOnHand: args.quantityDelta },
    });
  }

  /**
   * Upserts the warehouse-level (locationId IS NULL) StockLevel row for one
   * product+warehouse. `stockLevel.upsert()` can't target this row directly
   * — Prisma's compound-unique `where` rejects `null` for the nullable
   * `locationId` component (Postgres unique indexes don't make a NULL
   * component findable that way), so this does an explicit find, then
   * create-or-update. A concurrent first-write race (two transactions both
   * see no existing row) is resolved by retrying the loser as an update
   * after its `create` hits the unique constraint.
   */
  private async upsertWarehouseStockLevel(
    tx: Tx,
    tenantId: string,
    productId: string,
    warehouseId: string,
    args: {
      update: Parameters<Tx["stockLevel"]["update"]>[0]["data"];
      create: { quantityOnHand?: number; quantityReserved?: number };
    },
  ): Promise<StockLevelResult> {
    const where = { productId, warehouseId, locationId: null };

    const existing = await tx.stockLevel.findFirst({ where });
    if (existing) {
      return tx.stockLevel.update({ where: { id: existing.id }, data: args.update });
    }

    try {
      return await tx.stockLevel.create({ data: { tenantId, productId, warehouseId, ...args.create } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      const nowExisting = await tx.stockLevel.findFirstOrThrow({ where });
      return tx.stockLevel.update({ where: { id: nowExisting.id }, data: args.update });
    }
  }

  /** Public so callers that change reservation state outside an async event (e.g. SalesOrdersService) can notify observers after their own transaction commits. */
  async emitStockChanged(tenantId: string, productId: string, warehouseId: string, level: StockLevelResult) {
    const payload: StockChangedPayload = {
      tenantId,
      productId,
      warehouseId,
      quantityOnHand: level.quantityOnHand,
      quantityReserved: level.quantityReserved,
    };
    await this.events.emitAsync(DomainEvent.StockChanged, payload);
    if (level.quantityOnHand - level.quantityReserved <= 0) {
      await this.events.emitAsync(DomainEvent.StockLow, payload);
    }
  }
}
