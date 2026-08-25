import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Prisma, StockMovementType, withTenant } from "@chainos/database";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException } from "../../common/errors/app-exception";
import { claimEvent } from "../../common/events/claim-event";
import {
  DomainEvent,
  OrderReadyPayload,
  OrderReservedPayload,
  PoReceivedPayload,
  StockChangedPayload,
} from "../../common/events/domain-events";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

interface StockLevelResult {
  quantityOnHand: number;
  quantityReserved: number;
}

/**
 * Owns the inventory ledger. This is the only module allowed to write
 * StockLevel/StockMovement rows — everyone else gets there by emitting
 * po.received / order.reserved / order.ready and reacting to stock.changed
 * (manifest §1 "inventory is a ledger" + §2 module table).
 *
 * Idempotency: every handler here claims its `eventId` in `ProcessedEvent`
 * inside the same transaction as the ledger write it guards. A duplicate
 * delivery of the same event (retry, at-least-once redelivery) loses the
 * unique-constraint race and no-ops instead of double-applying — see
 * domain-events.ts for the contract this relies on.
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

  @OnEvent(DomainEvent.OrderReserved)
  async handleOrderReserved(payload: OrderReservedPayload) {
    const changes = await withTenant(payload.tenantId, async (tx) => {
      const claimed = await claimEvent(tx, payload.tenantId, payload.eventId, DomainEvent.OrderReserved);
      if (!claimed) {
        this.logger.debug(`order.reserved ${payload.eventId} already processed for order ${payload.customerOrderId} — skipping`);
        return [];
      }

      const results: Array<{ productId: string; warehouseId: string; level: StockLevelResult }> = [];
      for (const line of payload.lines) {
        const current = await tx.stockLevel.findFirst({
          where: { productId: line.productId, warehouseId: payload.warehouseId, locationId: null },
        });
        const available = (current?.quantityOnHand ?? 0) - (current?.quantityReserved ?? 0);
        if (available < line.qty) {
          throw new BadRequestAppException(
            AppErrorCode.INSUFFICIENT_STOCK,
            `Cannot reserve ${line.qty} of product ${line.productId}: only ${available} available`,
          );
        }
        const level = await this.upsertWarehouseStockLevel(tx, payload.tenantId, line.productId, payload.warehouseId, {
          update: { quantityReserved: { increment: line.qty } },
          create: { quantityReserved: line.qty },
        });
        results.push({ productId: line.productId, warehouseId: payload.warehouseId, level });
      }
      return results;
    });

    for (const change of changes) {
      await this.emitStockChanged(payload.tenantId, change.productId, change.warehouseId, change.level);
    }
  }

  @OnEvent(DomainEvent.OrderReady)
  async handleOrderReady(payload: OrderReadyPayload) {
    const changes = await withTenant(payload.tenantId, async (tx) => {
      const claimed = await claimEvent(tx, payload.tenantId, payload.eventId, DomainEvent.OrderReady);
      if (!claimed) {
        this.logger.debug(`order.ready ${payload.eventId} already processed for order ${payload.customerOrderId} — skipping`);
        return [];
      }

      const results: Array<{ productId: string; warehouseId: string; level: StockLevelResult }> = [];
      for (const line of payload.lines) {
        const level = await this.postMovement(tx, payload.tenantId, {
          productId: line.productId,
          warehouseId: payload.warehouseId,
          type: StockMovementType.FULFILLMENT,
          quantityDelta: -line.qty,
          customerOrderLineId: line.customerOrderLineId,
          releaseReservedQty: line.qty,
        });
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
      customerOrderLineId?: string;
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
        customerOrderLineId: args.customerOrderLineId,
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

  private async emitStockChanged(
    tenantId: string,
    productId: string,
    warehouseId: string,
    level: StockLevelResult,
  ) {
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
