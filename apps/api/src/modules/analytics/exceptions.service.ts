import { Injectable } from "@nestjs/common";
import { ShipmentExceptionStatus, withTenant, type Tx } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { OPEN_PO_STATUSES } from "../procurement/purchase-order-lifecycle";
import { OPEN_SO_STATUSES } from "../fulfillment/sales-order-lifecycle";
import type { AnalyticsFilters, Paginated, ResolvedPage } from "./analytics-filters";
import { computeInventoryRiskRows } from "./inventory-analytics.service";

export type ExceptionDomain = "PROCUREMENT" | "INVENTORY" | "FULFILLMENT" | "LOGISTICS";
export type ExceptionSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ExceptionItem {
  id: string;
  domain: ExceptionDomain;
  type: string;
  severity: ExceptionSeverity;
  message: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  detectedAt: string;
  href: string;
}

/**
 * Exception Center aggregation (spec §19–21). Logistics exceptions are the
 * persisted ShipmentException rows Phase 3 already computes and stores
 * (ShipmentsService.evaluateExceptions). Procurement/Fulfillment/Inventory
 * have no persisted exception concept yet — those are computed here, on
 * read, from the same deterministic rules used elsewhere in this module
 * (overdue PO/SO, inventory risk), not a new stored-exception table. See
 * docs/architecture/analytics.md for why this split is deliberate.
 */
@Injectable()
export class ExceptionsService {
  constructor(private readonly tenantContext: TenantContext) {}

  list(filters: AnalyticsFilters, page: ResolvedPage, domain?: ExceptionDomain, severity?: ExceptionSeverity): Promise<Paginated<ExceptionItem>> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const all = await this.computeAll(tx, tenantId, filters);
      const filtered = all
        .filter((e) => !domain || e.domain === domain)
        .filter((e) => !severity || e.severity === severity)
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.detectedAt.localeCompare(a.detectedAt));
      return { items: filtered.slice(page.skip, page.skip + page.take), page: page.page, pageSize: page.pageSize, total: filtered.length };
    });
  }

  counts(filters: AnalyticsFilters): Promise<{ critical: number; warning: number; info: number }> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const all = await this.computeAll(tx, tenantId, filters);
      return {
        critical: all.filter((e) => e.severity === "CRITICAL").length,
        warning: all.filter((e) => e.severity === "WARNING").length,
        info: all.filter((e) => e.severity === "INFO").length,
      };
    });
  }

  async top(tx: Tx, tenantId: string, filters: AnalyticsFilters, limit: number): Promise<ExceptionItem[]> {
    const all = await this.computeAll(tx, tenantId, filters);
    return all.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.detectedAt.localeCompare(a.detectedAt)).slice(0, limit);
  }

  private async computeAll(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<ExceptionItem[]> {
    const [logistics, procurement, fulfillment, inventory] = await Promise.all([
      this.logisticsExceptions(tx, tenantId, filters),
      this.procurementExceptions(tx, tenantId, filters),
      this.fulfillmentExceptions(tx, tenantId, filters),
      this.inventoryExceptions(tx, tenantId, filters),
    ]);
    return [...logistics, ...procurement, ...fulfillment, ...inventory];
  }

  private async logisticsExceptions(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<ExceptionItem[]> {
    const rows = await tx.shipmentException.findMany({
      where: {
        tenantId,
        status: ShipmentExceptionStatus.OPEN,
        shipment: {
          OR: filters.warehouseId ? [{ originWarehouseId: filters.warehouseId }, { destWarehouseId: filters.warehouseId }] : undefined,
        },
      },
      include: { shipment: { select: { shipmentNumber: true } } },
      orderBy: { detectedAt: "desc" },
    });
    return rows.map((row) => ({
      id: `logistics:${row.id}`,
      domain: "LOGISTICS",
      type: row.type,
      severity: row.severity,
      message: row.message,
      entityType: "Shipment",
      entityId: row.shipmentId,
      entityLabel: row.shipment.shipmentNumber,
      detectedAt: row.detectedAt.toISOString(),
      href: `/shipments/${row.shipmentId}`,
    }));
  }

  private async procurementExceptions(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<ExceptionItem[]> {
    const overdue = await tx.purchaseOrder.findMany({
      where: {
        tenantId,
        warehouseId: filters.warehouseId,
        status: { in: OPEN_PO_STATUSES },
        expectedDeliveryDate: { lt: new Date() },
      },
      select: { id: true, poNumber: true, expectedDeliveryDate: true },
    });
    return overdue.map((po) => ({
      id: `procurement:po-overdue:${po.id}`,
      domain: "PROCUREMENT",
      type: "OVERDUE_PO",
      severity: "WARNING",
      message: `Expected delivery (${po.expectedDeliveryDate!.toISOString().slice(0, 10)}) has passed.`,
      entityType: "PurchaseOrder",
      entityId: po.id,
      entityLabel: po.poNumber,
      detectedAt: po.expectedDeliveryDate!.toISOString(),
      href: `/purchase-orders/${po.id}`,
    }));
  }

  private async fulfillmentExceptions(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<ExceptionItem[]> {
    const overdue = await tx.salesOrder.findMany({
      where: {
        tenantId,
        warehouseId: filters.warehouseId,
        customerId: filters.customerId,
        status: { in: OPEN_SO_STATUSES },
        requestedDeliveryDate: { lt: new Date() },
      },
      select: { id: true, orderNumber: true, requestedDeliveryDate: true },
    });
    return overdue.map((so) => ({
      id: `fulfillment:so-overdue:${so.id}`,
      domain: "FULFILLMENT",
      type: "REQUESTED_DELIVERY_OVERDUE",
      severity: "WARNING",
      message: `Requested delivery (${so.requestedDeliveryDate!.toISOString().slice(0, 10)}) has passed.`,
      entityType: "SalesOrder",
      entityId: so.id,
      entityLabel: so.orderNumber,
      detectedAt: so.requestedDeliveryDate!.toISOString(),
      href: `/sales-orders/${so.id}`,
    }));
  }

  /** Available <= 0 with open demand: CRITICAL. Projected < 0 (still available > 0): WARNING (spec §21). */
  private async inventoryExceptions(tx: Tx, tenantId: string, filters: AnalyticsFilters): Promise<ExceptionItem[]> {
    const rows = await computeInventoryRiskRows(tx, tenantId, filters);
    const now = new Date().toISOString();
    return rows
      .filter((r) => r.riskLevel !== "HEALTHY")
      .map((r) => ({
        id: `inventory:${r.riskLevel.toLowerCase()}:${r.productId}:${r.warehouseId}`,
        domain: "INVENTORY" as const,
        type: r.riskLevel,
        severity: (r.riskLevel === "STOCKOUT" && r.demand > 0 ? "CRITICAL" : "WARNING") as ExceptionSeverity,
        message:
          r.riskLevel === "STOCKOUT"
            ? `${r.sku} has zero available stock at ${r.warehouseName} with ${r.demand} units of open demand.`
            : `${r.sku} projected to run ${Math.abs(r.projected)} short at ${r.warehouseName}.`,
        entityType: "Product",
        entityId: r.productId,
        entityLabel: r.sku,
        detectedAt: now,
        href: `/inventory/risk?productId=${r.productId}`,
      }));
  }
}

function severityRank(severity: ExceptionSeverity): number {
  return severity === "CRITICAL" ? 2 : severity === "WARNING" ? 1 : 0;
}
