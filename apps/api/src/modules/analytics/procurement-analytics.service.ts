import { Injectable } from "@nestjs/common";
import { PurchaseOrderStatus, withTenant, type Tx } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { OPEN_PO_STATUSES } from "../procurement/purchase-order-lifecycle";
import type { AnalyticsFilters } from "./analytics-filters";
import { decimalToNumber, resolveTrendBucket, round2, trendBucketKey } from "./analytics.util";

export interface ProcurementSummary {
  openPurchaseOrders: number;
  openPurchaseOrderValue: number;
  overduePurchaseOrders: number;
  partiallyReceivedPurchaseOrders: number;
}

export interface PoValueTrendPoint {
  bucket: string;
  value: number;
}

@Injectable()
export class ProcurementAnalyticsService {
  constructor(private readonly tenantContext: TenantContext) {}

  summary(filters: AnalyticsFilters): Promise<ProcurementSummary> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeSummary(tx, tenantId, filters));
  }

  /** Reused by the Control Tower service inside its own transaction — see control-tower.service.ts. */
  async computeSummary(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<ProcurementSummary> {
    const scope = {
      tenantId,
      warehouseId: filters.warehouseId,
      supplierId: filters.supplierId,
      orderDate: { gte: filters.from, lte: filters.to },
    };

    const [openCount, overdueCount, partialCount, openLines] = await Promise.all([
      tx.purchaseOrder.count({ where: { ...scope, status: { in: OPEN_PO_STATUSES } } }),
      tx.purchaseOrder.count({
        where: { ...scope, status: { in: OPEN_PO_STATUSES }, expectedDeliveryDate: { lt: new Date() } },
      }),
      tx.purchaseOrder.count({ where: { ...scope, status: PurchaseOrderStatus.PARTIALLY_RECEIVED } }),
      // qty * unitCost isn't expressible in Prisma's typed aggregate API — this
      // fetches only the scalar columns needed, scoped by the same indexed
      // where-clause, and sums in the application layer (see docs/architecture/analytics.md).
      tx.purchaseOrderLine.findMany({
        where: { tenantId, purchaseOrder: { ...scope, status: { in: OPEN_PO_STATUSES } } },
        select: { qtyOrdered: true, unitCost: true },
      }),
    ]);

    const openValue = openLines.reduce((sum, line) => sum + line.qtyOrdered * decimalToNumber(line.unitCost), 0);

    return {
      openPurchaseOrders: openCount,
      openPurchaseOrderValue: round2(openValue),
      overduePurchaseOrders: overdueCount,
      partiallyReceivedPurchaseOrders: partialCount,
    };
  }

  valueTrend(filters: AnalyticsFilters): Promise<PoValueTrendPoint[]> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeValueTrend(tx, tenantId, filters));
  }

  async computeValueTrend(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<PoValueTrendPoint[]> {
    const lines = await tx.purchaseOrderLine.findMany({
      where: {
        tenantId,
        purchaseOrder: {
          tenantId,
          warehouseId: filters.warehouseId,
          supplierId: filters.supplierId,
          orderDate: { gte: filters.from, lte: filters.to },
        },
      },
      select: { qtyOrdered: true, unitCost: true, purchaseOrder: { select: { orderDate: true } } },
    });

    const bucket = resolveTrendBucket(filters.from, filters.to);
    const totals = new Map<string, number>();
    for (const line of lines) {
      const key = trendBucketKey(line.purchaseOrder.orderDate, bucket);
      totals.set(key, (totals.get(key) ?? 0) + line.qtyOrdered * decimalToNumber(line.unitCost));
    }

    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucketKey, value]) => ({ bucket: bucketKey, value: round2(value) }));
  }
}
