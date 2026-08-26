import { Injectable } from "@nestjs/common";
import { ShipmentDirection, ShipmentExceptionStatus, ShipmentExceptionType, ShipmentStatus, withTenant, type Tx } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import type { AnalyticsFilters } from "./analytics-filters";
import { round2, safePercent } from "./analytics.util";

/** Mirrors ShipmentsService.ACTIVE_STATUSES — analytics aggregates the existing lifecycle, it does not redefine it. */
export const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.CREATED,
  ShipmentStatus.BOOKED,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.ARRIVED,
];

export interface LogisticsSummary {
  activeShipments: number;
  inboundActive: number;
  outboundActive: number;
  delayedShipments: number;
  needsAttentionShipments: number;
  avgTransitHours: number | null;
  onTimeDeliveryPercent: number | null;
}

@Injectable()
export class LogisticsAnalyticsService {
  constructor(private readonly tenantContext: TenantContext) {}

  summary(filters: AnalyticsFilters): Promise<LogisticsSummary> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => this.computeSummary(tx, tenantId, filters));
  }

  async computeSummary(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<LogisticsSummary> {
    const [activeCount, inboundActive, outboundActive, delayedCount, attentionCount, completed] = await Promise.all([
      tx.shipment.count({ where: this.warehouseScoped(tenantId, filters, { status: { in: ACTIVE_SHIPMENT_STATUSES } }) }),
      tx.shipment.count({
        where: this.warehouseScoped(tenantId, filters, { status: { in: ACTIVE_SHIPMENT_STATUSES }, direction: ShipmentDirection.INBOUND }),
      }),
      tx.shipment.count({
        where: this.warehouseScoped(tenantId, filters, { status: { in: ACTIVE_SHIPMENT_STATUSES }, direction: ShipmentDirection.OUTBOUND }),
      }),
      tx.shipment.count({
        where: this.warehouseScoped(tenantId, filters, {
          status: { in: ACTIVE_SHIPMENT_STATUSES },
          exceptions: { some: { type: ShipmentExceptionType.ETA_EXCEEDED, status: ShipmentExceptionStatus.OPEN } },
        }),
      }),
      tx.shipment.count({
        where: this.warehouseScoped(tenantId, filters, {
          status: { in: ACTIVE_SHIPMENT_STATUSES },
          exceptions: { some: { status: ShipmentExceptionStatus.OPEN } },
        }),
      }),
      tx.shipment.findMany({
        where: this.warehouseScoped(tenantId, filters, {
          status: ShipmentStatus.DELIVERED,
          deliveredAt: { gte: filters.from, lte: filters.to },
        }),
        select: { actualDepartureAt: true, actualArrivalAt: true, deliveredAt: true, estimatedArrivalAt: true },
      }),
    ]);

    const withTransit = completed.filter((s) => s.actualDepartureAt && s.actualArrivalAt);
    const avgTransitHours = withTransit.length
      ? round2(
          withTransit.reduce((sum, s) => sum + (s.actualArrivalAt!.getTime() - s.actualDepartureAt!.getTime()) / (60 * 60 * 1000), 0) /
            withTransit.length,
        )
      : null;

    const withEta = completed.filter((s) => s.estimatedArrivalAt && s.deliveredAt);
    const onTime = withEta.filter((s) => s.deliveredAt!.getTime() <= s.estimatedArrivalAt!.getTime()).length;

    return {
      activeShipments: activeCount,
      inboundActive,
      outboundActive,
      delayedShipments: delayedCount,
      needsAttentionShipments: attentionCount,
      avgTransitHours,
      onTimeDeliveryPercent: safePercent(onTime, withEta.length),
    };
  }

  /**
   * A shipment has no single "warehouse" column — inbound ships *to* a
   * warehouse (destWarehouseId), outbound ships *from* one
   * (originWarehouseId). The warehouse filter matches whichever side
   * applies, per shipment.
   */
  private warehouseScoped(tenantId: string, filters: AnalyticsFilters, extra: Record<string, unknown>) {
    if (!filters.warehouseId) return { tenantId, ...extra };
    return {
      tenantId,
      ...extra,
      OR: [{ originWarehouseId: filters.warehouseId }, { destWarehouseId: filters.warehouseId }],
    };
  }
}
