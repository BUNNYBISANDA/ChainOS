import { Injectable } from "@nestjs/common";
import { SalesOrderStatus, ShipmentDirection, ShipmentStatus, withTenant, type Tx } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { OPEN_SO_STATUSES } from "../fulfillment/sales-order-lifecycle";
import type { AnalyticsFilters } from "./analytics-filters";
import { isOtifSuccess, resolveTrendBucket, safePercent, trendBucketKey } from "./analytics.util";

export interface FulfillmentSummary {
  openSalesOrders: number;
  awaitingAllocation: number;
  partiallyFulfilled: number;
  fulfilled: number;
  customerOtifPercent: number | null;
  otifEligibleOrders: number;
  otifSuccessfulOrders: number;
  ordersMissingRequestedDate: number;
}

export interface OtifTrendPoint {
  bucket: string;
  eligible: number;
  successful: number;
  otifPercent: number | null;
}

@Injectable()
export class FulfillmentAnalyticsService {
  constructor(private readonly tenantContext: TenantContext) {}

  summary(filters: AnalyticsFilters): Promise<FulfillmentSummary> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeSummary(tx, tenantId, filters));
  }

  async computeSummary(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<FulfillmentSummary> {
    const scope = {
      tenantId,
      warehouseId: filters.warehouseId,
      customerId: filters.customerId,
      orderDate: { gte: filters.from, lte: filters.to },
    };

    const [openCount, awaitingCount, partialCount, fulfilledCount, otif] = await Promise.all([
      tx.salesOrder.count({ where: { ...scope, status: { in: OPEN_SO_STATUSES } } }),
      tx.salesOrder.count({ where: { ...scope, status: SalesOrderStatus.CONFIRMED } }),
      tx.salesOrder.count({ where: { ...scope, status: SalesOrderStatus.PARTIALLY_FULFILLED } }),
      tx.salesOrder.count({ where: { ...scope, status: SalesOrderStatus.FULFILLED } }),
      this.computeOtif(tx, tenantId, filters),
    ]);

    return {
      openSalesOrders: openCount,
      awaitingAllocation: awaitingCount,
      partiallyFulfilled: partialCount,
      fulfilled: fulfilledCount,
      customerOtifPercent: otif.otifPercent,
      otifEligibleOrders: otif.eligible.length,
      otifSuccessfulOrders: otif.eligible.filter((o) => o.success).length,
      ordersMissingRequestedDate: otif.missingRequestedDate,
    };
  }

  /**
   * Customer OTIF — see docs/adr/0010-otif-definition.md. Eligible: a
   * SalesOrder whose linked outbound Shipment reached DELIVERED, with a
   * requestedDeliveryDate on file; orders without either are excluded from
   * the denominator (not scored as failures) and counted separately as a
   * data-quality signal. Success: SalesOrder.status = FULFILLED (in full,
   * by construction of that status) AND Shipment.deliveredAt <=
   * requestedDeliveryDate. The date-range filter applies to `deliveredAt`
   * — OTIF measures deliveries that happened in the period, not orders
   * placed in it.
   */
  private async computeOtif(
    tx: Tx,
    tenantId: string,
    filters: AnalyticsFilters,
  ): Promise<{ eligible: Array<{ success: boolean }>; otifPercent: number | null; missingRequestedDate: number }> {
    const candidates = await tx.salesOrder.findMany({
      where: {
        tenantId,
        warehouseId: filters.warehouseId,
        customerId: filters.customerId,
        shipment: {
          direction: ShipmentDirection.OUTBOUND,
          status: ShipmentStatus.DELIVERED,
          deliveredAt: { gte: filters.from, lte: filters.to },
        },
      },
      select: { status: true, requestedDeliveryDate: true, shipment: { select: { deliveredAt: true } } },
    });

    const missingRequestedDate = candidates.filter((c) => !c.requestedDeliveryDate).length;
    const eligible = candidates
      .filter((c): c is typeof c & { requestedDeliveryDate: Date; shipment: { deliveredAt: Date } } => Boolean(c.requestedDeliveryDate) && Boolean(c.shipment?.deliveredAt))
      .map((c) => ({
        success: isOtifSuccess({
          fullyFulfilled: c.status === SalesOrderStatus.FULFILLED,
          deliveredAt: c.shipment.deliveredAt,
          requestedDeliveryDate: c.requestedDeliveryDate,
        }),
      }));

    const otifPercent = safePercent(eligible.filter((e) => e.success).length, eligible.length);
    return { eligible, otifPercent, missingRequestedDate };
  }

  otifTrend(filters: AnalyticsFilters): Promise<OtifTrendPoint[]> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeOtifTrend(tx, tenantId, filters));
  }

  async computeOtifTrend(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<OtifTrendPoint[]> {
    const candidates = await tx.salesOrder.findMany({
      where: {
        tenantId,
        warehouseId: filters.warehouseId,
        customerId: filters.customerId,
        requestedDeliveryDate: { not: null },
        shipment: {
          direction: ShipmentDirection.OUTBOUND,
          status: ShipmentStatus.DELIVERED,
          deliveredAt: { gte: filters.from, lte: filters.to },
        },
      },
      select: { status: true, requestedDeliveryDate: true, shipment: { select: { deliveredAt: true } } },
    });

    const bucket = resolveTrendBucket(filters.from, filters.to);
    const buckets = new Map<string, { eligible: number; successful: number }>();
    for (const c of candidates) {
      if (!c.requestedDeliveryDate || !c.shipment?.deliveredAt) continue;
      const key = trendBucketKey(c.shipment.deliveredAt, bucket);
      const point = buckets.get(key) ?? { eligible: 0, successful: 0 };
      point.eligible += 1;
      if (isOtifSuccess({ fullyFulfilled: c.status === SalesOrderStatus.FULFILLED, deliveredAt: c.shipment.deliveredAt, requestedDeliveryDate: c.requestedDeliveryDate })) {
        point.successful += 1;
      }
      buckets.set(key, point);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucketKey, point]) => ({
        bucket: bucketKey,
        eligible: point.eligible,
        successful: point.successful,
        otifPercent: safePercent(point.successful, point.eligible),
      }));
  }
}
