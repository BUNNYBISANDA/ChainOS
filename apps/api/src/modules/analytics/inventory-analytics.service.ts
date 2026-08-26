import { Injectable } from "@nestjs/common";
import { StockMovementType, withTenant, type Tx } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { INCOMING_PO_STATUSES } from "../procurement/purchase-order-lifecycle";
import { OPEN_DEMAND_SO_STATUSES } from "../fulfillment/sales-order-lifecycle";
import type { AnalyticsFilters, Paginated, ResolvedPage } from "./analytics-filters";
import { classifyInventoryRisk, decimalToNumber, resolveTrendBucket, round2, trendBucketKey, type InventoryRiskLevel } from "./analytics.util";

export interface InventoryRiskRow {
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  demand: number;
  projected: number;
  riskLevel: InventoryRiskLevel;
}

export interface InventorySummary {
  inventoryValue: number;
  productsMissingCost: number;
  skusZeroAvailable: number;
  skusAtRisk: number;
}

export interface InventoryMovementPoint {
  bucket: string;
  inbound: number;
  outbound: number;
  net: number;
}

@Injectable()
export class InventoryAnalyticsService {
  constructor(private readonly tenantContext: TenantContext) {}

  summary(filters: AnalyticsFilters): Promise<InventorySummary> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeSummary(tx, tenantId, filters));
  }

  async computeSummary(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<InventorySummary> {
    const rows = await computeInventoryRiskRows(tx, tenantId, filters);
    const inventoryValue = round2(rows.reduce((sum, row) => sum + row.onHand * row.costPrice, 0));
    return {
      inventoryValue,
      productsMissingCost: new Set(rows.filter((r) => r.costPrice === 0).map((r) => r.productId)).size,
      skusZeroAvailable: rows.filter((r) => r.available <= 0).length,
      skusAtRisk: rows.filter((r) => r.riskLevel !== "HEALTHY").length,
    };
  }

  riskList(filters: AnalyticsFilters, page: ResolvedPage, riskLevel?: InventoryRiskLevel, productId?: string): Promise<Paginated<InventoryRiskRow>> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const rows = await computeInventoryRiskRows(tx, tenantId, filters);
      const filtered = rows.filter((r) => (!riskLevel || r.riskLevel === riskLevel) && (!productId || r.productId === productId));
      // Sorted by most-negative projected availability first (spec §16).
      filtered.sort((a, b) => a.projected - b.projected);
      const items = filtered.slice(page.skip, page.skip + page.take).map(stripCost);
      return { items, page: page.page, pageSize: page.pageSize, total: filtered.length };
    });
  }

  movementTrend(filters: AnalyticsFilters): Promise<InventoryMovementPoint[]> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeMovementTrend(tx, tenantId, filters));
  }

  /** Physical ledger only — RECEIPT/FULFILLMENT/ADJUSTMENT/TRANSFER, never a reservation (spec §29). */
  async computeMovementTrend(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<InventoryMovementPoint[]> {
    const movements = await tx.stockMovement.findMany({
      where: { tenantId, warehouseId: filters.warehouseId, createdAt: { gte: filters.from, lte: filters.to } },
      select: { type: true, quantityDelta: true, createdAt: true },
    });

    const bucket = resolveTrendBucket(filters.from, filters.to);
    const points = new Map<string, { inbound: number; outbound: number }>();
    for (const movement of movements) {
      const key = trendBucketKey(movement.createdAt, bucket);
      const point = points.get(key) ?? { inbound: 0, outbound: 0 };
      if (movement.type === StockMovementType.RECEIPT && movement.quantityDelta > 0) point.inbound += movement.quantityDelta;
      if (movement.type === StockMovementType.FULFILLMENT && movement.quantityDelta < 0) point.outbound += Math.abs(movement.quantityDelta);
      points.set(key, point);
    }

    return [...points.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucketKey, point]) => ({ bucket: bucketKey, inbound: point.inbound, outbound: point.outbound, net: point.inbound - point.outbound }));
  }
}

/**
 * One pass computing risk (Available/Incoming/Demand/Projected) for every
 * SKU x warehouse in scope. Bounded by distinct product x warehouse
 * combinations (small at this stage — see docs/architecture/analytics.md
 * for when a materialized view would replace this). Exported (not a class
 * method) so ExceptionsService can reuse the exact same rows without a
 * nested-transaction call into InventoryAnalyticsService.
 */
export async function computeInventoryRiskRows(
  tx: Tx,
  tenantId: string,
  filters: AnalyticsFilters,
): Promise<Array<InventoryRiskRow & { costPrice: number }>> {
  const stockLevels = await tx.stockLevel.findMany({
    where: { tenantId, warehouseId: filters.warehouseId },
    include: { product: true, warehouse: true },
  });
  if (stockLevels.length === 0) return [];

  const productIds = [...new Set(stockLevels.map((s) => s.productId))];
  const warehouseIds = [...new Set(stockLevels.map((s) => s.warehouseId))];

  const [incomingLines, demandLines] = await Promise.all([
    tx.purchaseOrderLine.findMany({
      where: {
        tenantId,
        productId: { in: productIds },
        purchaseOrder: { tenantId, warehouseId: { in: warehouseIds }, status: { in: INCOMING_PO_STATUSES } },
      },
      select: { productId: true, qtyOrdered: true, qtyReceived: true, purchaseOrder: { select: { warehouseId: true } } },
    }),
    tx.salesOrderLine.findMany({
      where: {
        tenantId,
        productId: { in: productIds },
        salesOrder: { tenantId, warehouseId: { in: warehouseIds }, status: { in: OPEN_DEMAND_SO_STATUSES } },
      },
      select: { productId: true, qtyOrdered: true, qtyFulfilled: true, salesOrder: { select: { warehouseId: true } } },
    }),
  ]);

  const incomingByKey = new Map<string, number>();
  for (const line of incomingLines) {
    const key = `${line.productId}:${line.purchaseOrder.warehouseId}`;
    incomingByKey.set(key, (incomingByKey.get(key) ?? 0) + (line.qtyOrdered - line.qtyReceived));
  }
  const demandByKey = new Map<string, number>();
  for (const line of demandLines) {
    const key = `${line.productId}:${line.salesOrder.warehouseId}`;
    demandByKey.set(key, (demandByKey.get(key) ?? 0) + (line.qtyOrdered - line.qtyFulfilled));
  }

  return stockLevels.map((level) => {
    const key = `${level.productId}:${level.warehouseId}`;
    const available = level.quantityOnHand - level.quantityReserved;
    const incoming = incomingByKey.get(key) ?? 0;
    const demand = demandByKey.get(key) ?? 0;
    const projected = available + incoming - demand;
    return {
      productId: level.productId,
      sku: level.product.sku,
      productName: level.product.name,
      warehouseId: level.warehouseId,
      warehouseName: level.warehouse.name,
      onHand: level.quantityOnHand,
      reserved: level.quantityReserved,
      available,
      incoming,
      demand,
      projected,
      riskLevel: classifyInventoryRisk(available, projected),
      costPrice: decimalToNumber(level.product.costPrice),
    };
  });
}

function stripCost(row: InventoryRiskRow & { costPrice: number }): InventoryRiskRow {
  const { costPrice: _costPrice, ...rest } = row;
  return rest;
}
