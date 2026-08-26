import { Injectable } from "@nestjs/common";
import { ShipmentStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import type { AnalyticsFilters } from "./analytics-filters";
import { ProcurementAnalyticsService } from "./procurement-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { FulfillmentAnalyticsService } from "./fulfillment-analytics.service";
import { LogisticsAnalyticsService, ACTIVE_SHIPMENT_STATUSES } from "./logistics-analytics.service";
import { SupplierAnalyticsService } from "./supplier-analytics.service";
import { ExceptionsService } from "./exceptions.service";
import { decimalToNumber } from "./analytics.util";

export interface NetworkPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface NetworkShipmentPoint {
  id: string;
  shipmentNumber: string;
  direction: "INBOUND" | "OUTBOUND";
  status: ShipmentStatus;
  latitude: number;
  longitude: number;
}

/**
 * Control Tower summary (spec §33) — aggregates + a small top-exceptions
 * list, never the full detail lists (those live behind the dedicated
 * drill-down endpoints/pages). Every sub-service query runs independently
 * (its own withTenant transaction) in parallel — each is a handful of
 * short, indexed reads, so this is a small constant number of round-trips,
 * not N+1 (spec §57).
 */
@Injectable()
export class ControlTowerService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly procurement: ProcurementAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly fulfillment: FulfillmentAnalyticsService,
    private readonly logistics: LogisticsAnalyticsService,
    private readonly suppliers: SupplierAnalyticsService,
    private readonly exceptions: ExceptionsService,
  ) {}

  async summary(filters: AnalyticsFilters) {
    const [procurement, inventory, fulfillment, logistics, exceptionCounts, topExceptions, topSuppliers, network] = await Promise.all([
      this.procurement.summary(filters),
      this.inventory.summary(filters),
      this.fulfillment.summary(filters),
      this.logistics.summary(filters),
      this.exceptions.counts(filters),
      this.exceptions.list(filters, { page: 1, pageSize: 5, skip: 0, take: 5 }),
      this.suppliers.list(filters, { page: 1, pageSize: 5, skip: 0, take: 5 }),
      this.network(filters),
    ]);
    const dataQuality = this.dataQuality(inventory, fulfillment);

    return {
      period: { from: filters.from.toISOString(), to: filters.to.toISOString(), preset: filters.preset },
      warehouseId: filters.warehouseId ?? null,
      lastUpdated: new Date().toISOString(),
      procurement,
      inventory,
      fulfillment,
      logistics,
      service: { customerOtifPercent: fulfillment.customerOtifPercent },
      exceptions: { critical: exceptionCounts.critical, warning: exceptionCounts.warning, top: topExceptions.items },
      topSuppliers: topSuppliers.items,
      dataQuality,
      network,
    };
  }

  /**
   * Supply Chain Network Map data (spec §23) — only entities with real
   * coordinates on file, never invented/geocoded. Suppliers/warehouses/
   * customers are shown tenant-wide (the network is the whole graph);
   * active shipments respect the warehouse filter, same scoping
   * LogisticsAnalyticsService uses for its own counts.
   */
  private async network(filters: AnalyticsFilters): Promise<{
    suppliers: NetworkPoint[];
    warehouses: NetworkPoint[];
    customers: NetworkPoint[];
    activeShipments: NetworkShipmentPoint[];
  }> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const [suppliers, warehouses, customers, shipments] = await Promise.all([
        tx.supplier.findMany({ where: { tenantId, latitude: { not: null }, longitude: { not: null } }, select: { id: true, name: true, latitude: true, longitude: true } }),
        tx.warehouse.findMany({ where: { tenantId, latitude: { not: null }, longitude: { not: null } }, select: { id: true, name: true, latitude: true, longitude: true } }),
        tx.customer.findMany({ where: { tenantId, latitude: { not: null }, longitude: { not: null } }, select: { id: true, companyName: true, latitude: true, longitude: true } }),
        tx.shipment.findMany({
          where: {
            tenantId,
            status: { in: ACTIVE_SHIPMENT_STATUSES },
            OR: filters.warehouseId ? [{ originWarehouseId: filters.warehouseId }, { destWarehouseId: filters.warehouseId }] : undefined,
          },
          select: {
            id: true,
            shipmentNumber: true,
            direction: true,
            status: true,
            currentLatitude: true,
            currentLongitude: true,
            originLatitude: true,
            originLongitude: true,
            destinationLatitude: true,
            destinationLongitude: true,
          },
        }),
      ]);

      return {
        suppliers: suppliers.map((s) => ({ id: s.id, label: s.name, latitude: decimalToNumber(s.latitude), longitude: decimalToNumber(s.longitude) })),
        warehouses: warehouses.map((w) => ({ id: w.id, label: w.name, latitude: decimalToNumber(w.latitude), longitude: decimalToNumber(w.longitude) })),
        customers: customers.map((c) => ({ id: c.id, label: c.companyName, latitude: decimalToNumber(c.latitude), longitude: decimalToNumber(c.longitude) })),
        activeShipments: shipments
          .map((s) => {
            const lat = s.currentLatitude ?? s.originLatitude ?? s.destinationLatitude;
            const lng = s.currentLongitude ?? s.originLongitude ?? s.destinationLongitude;
            if (lat === null || lng === null) return null;
            return {
              id: s.id,
              shipmentNumber: s.shipmentNumber,
              direction: s.direction,
              status: s.status,
              latitude: decimalToNumber(lat),
              longitude: decimalToNumber(lng),
            };
          })
          .filter((s): s is NetworkShipmentPoint => s !== null),
      };
    });
  }

  /** Reuses counts the inventory/fulfillment summaries already computed — no extra queries (spec §45). */
  private dataQuality(
    inventory: Awaited<ReturnType<InventoryAnalyticsService["summary"]>>,
    fulfillment: Awaited<ReturnType<FulfillmentAnalyticsService["summary"]>>,
  ) {
    const issues = [
      { key: "productsMissingCost", label: "Products missing a cost price", count: inventory.productsMissingCost },
      { key: "ordersMissingRequestedDate", label: "Delivered orders missing a requested delivery date", count: fulfillment.ordersMissingRequestedDate },
    ].filter((issue) => issue.count > 0);
    return { total: issues.reduce((sum, i) => sum + i.count, 0), issues };
  }
}
