import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { StockMovementType, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import {
  DomainEvent,
  OrderReadyPayload,
  OrderReservedPayload,
  PoReceivedPayload,
  StockChangedPayload,
} from "../../common/events/domain-events";

/**
 * Owns the inventory ledger. This is the only module allowed to write
 * StockLevel/StockMovement rows — everyone else gets there by emitting
 * po.received / order.reserved / order.ready and reacting to stock.changed
 * (manifest §1 "inventory is a ledger" + §2 module table).
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly events: EventEmitter2) {}

  @OnEvent(DomainEvent.PoReceived)
  async handlePoReceived(payload: PoReceivedPayload) {
    this.logger.debug(`po.received -> posting ${payload.lines.length} receipt(s) for PO ${payload.purchaseOrderId}`);
    for (const line of payload.lines) {
      const level = await this.postMovement(payload.tenantId, {
        productId: line.productId,
        warehouseId: payload.warehouseId,
        type: StockMovementType.RECEIPT,
        quantityDelta: line.qtyReceived,
        purchaseOrderLineId: line.purchaseOrderLineId,
      });
      this.emitStockChanged(payload.tenantId, line.productId, payload.warehouseId, level);
    }
  }

  @OnEvent(DomainEvent.OrderReserved)
  async handleOrderReserved(payload: OrderReservedPayload) {
    for (const line of payload.lines) {
      const level = await withTenant(payload.tenantId, async (tx) => {
        const current = await tx.stockLevel.findFirst({
          where: { productId: line.productId, warehouseId: payload.warehouseId, locationId: null },
        });
        const available = (current?.quantityOnHand ?? 0) - (current?.quantityReserved ?? 0);
        if (available < line.qty) {
          throw new BadRequestException(
            `Cannot reserve ${line.qty} of product ${line.productId}: only ${available} available`,
          );
        }
        return tx.stockLevel.upsert({
          where: {
            productId_warehouseId_locationId: {
              productId: line.productId,
              warehouseId: payload.warehouseId,
              locationId: null as unknown as string,
            },
          },
          update: { quantityReserved: { increment: line.qty } },
          create: {
            tenantId: payload.tenantId,
            productId: line.productId,
            warehouseId: payload.warehouseId,
            quantityReserved: line.qty,
          },
        });
      });
      this.emitStockChanged(payload.tenantId, line.productId, payload.warehouseId, level);
    }
  }

  @OnEvent(DomainEvent.OrderReady)
  async handleOrderReady(payload: OrderReadyPayload) {
    for (const line of payload.lines) {
      const level = await this.postMovement(payload.tenantId, {
        productId: line.productId,
        warehouseId: payload.warehouseId,
        type: StockMovementType.FULFILLMENT,
        quantityDelta: -line.qty,
        customerOrderLineId: line.customerOrderLineId,
        releaseReservedQty: line.qty,
      });
      this.emitStockChanged(payload.tenantId, line.productId, payload.warehouseId, level);
    }
  }

  listStockLevels(tenantId: string) {
    return withTenant(tenantId, (tx) => tx.stockLevel.findMany({ where: { tenantId } }));
  }

  /** Posts one ledger row and updates the materialized StockLevel in the same transaction. */
  private postMovement(
    tenantId: string,
    args: {
      productId: string;
      warehouseId: string;
      type: StockMovementType;
      quantityDelta: number;
      purchaseOrderLineId?: string;
      customerOrderLineId?: string;
      releaseReservedQty?: number;
    },
  ) {
    return withTenant(tenantId, async (tx) => {
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: args.productId,
          warehouseId: args.warehouseId,
          type: args.type,
          quantityDelta: args.quantityDelta,
          purchaseOrderLineId: args.purchaseOrderLineId,
          customerOrderLineId: args.customerOrderLineId,
        },
      });

      return tx.stockLevel.upsert({
        where: {
          productId_warehouseId_locationId: {
            productId: args.productId,
            warehouseId: args.warehouseId,
            locationId: null as unknown as string,
          },
        },
        update: {
          quantityOnHand: { increment: args.quantityDelta },
          ...(args.releaseReservedQty ? { quantityReserved: { decrement: args.releaseReservedQty } } : {}),
        },
        create: {
          tenantId,
          productId: args.productId,
          warehouseId: args.warehouseId,
          quantityOnHand: args.quantityDelta,
        },
      });
    });
  }

  private emitStockChanged(
    tenantId: string,
    productId: string,
    warehouseId: string,
    level: { quantityOnHand: number; quantityReserved: number },
  ) {
    const payload: StockChangedPayload = {
      tenantId,
      productId,
      warehouseId,
      quantityOnHand: level.quantityOnHand,
      quantityReserved: level.quantityReserved,
    };
    this.events.emit(DomainEvent.StockChanged, payload);
    if (level.quantityOnHand - level.quantityReserved <= 0) {
      this.events.emit(DomainEvent.StockLow, payload);
    }
  }
}
