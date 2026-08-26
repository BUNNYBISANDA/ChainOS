import { Injectable } from "@nestjs/common";
import { PurchaseOrderStatus, withTenant, type Tx } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException } from "../../common/errors/app-exception";
import { OPEN_PO_STATUSES } from "../procurement/purchase-order-lifecycle";
import type { AnalyticsFilters, Paginated, ResolvedPage } from "./analytics-filters";
import { decimalToNumber, round2, safePercent } from "./analytics.util";

export type SupplierSortKey = "spend" | "poCount" | "onTime" | "otif" | "leadTime" | "late";

function sortComparator(sort: SupplierSortKey): (a: SupplierPerformanceRow, b: SupplierPerformanceRow) => number {
  switch (sort) {
    case "poCount":
      return (a, b) => b.poCount - a.poCount;
    case "onTime":
      return (a, b) => (b.onTimePercent ?? -1) - (a.onTimePercent ?? -1);
    case "otif":
      return (a, b) => (b.otifPercent ?? -1) - (a.otifPercent ?? -1);
    case "leadTime":
      return (a, b) => (a.avgLeadTimeDays ?? Infinity) - (b.avgLeadTimeDays ?? Infinity);
    case "late":
      return (a, b) => b.latePoCount - a.latePoCount;
    case "spend":
    default:
      return (a, b) => b.totalSpend - a.totalSpend;
  }
}

export interface SupplierPerformanceRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  poCount: number;
  totalSpend: number;
  openPoCount: number;
  latePoCount: number;
  avgLeadTimeDays: number | null;
  onTimePercent: number | null;
  otifPercent: number | null;
}

@Injectable()
export class SupplierAnalyticsService {
  constructor(private readonly tenantContext: TenantContext) {}

  list(filters: AnalyticsFilters, page: ResolvedPage, sort: SupplierSortKey = "spend", search?: string): Promise<Paginated<SupplierPerformanceRow>> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const rows = await this.computeRows(tx, tenantId, filters, search);
      rows.sort(sortComparator(sort));
      return { items: rows.slice(page.skip, page.skip + page.take), page: page.page, pageSize: page.pageSize, total: rows.length };
    });
  }

  async get(supplierId: string, filters: AnalyticsFilters): Promise<SupplierPerformanceRow> {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const rows = await this.computeRows(tx, tenantId, { ...filters, supplierId });
      const row = rows.find((r) => r.supplierId === supplierId);
      if (!row) throw new NotFoundAppException("Supplier not found");
      return row;
    });
  }

  /**
   * Supplier OTIF (inbound) — see docs/adr/0010-otif-definition.md.
   * Eligible: PurchaseOrder.status = RECEIVED with expectedDeliveryDate on
   * file and at least one GoodsReceipt. In-full is implied by RECEIVED
   * (mirrors the sales-order side). On time: the last GoodsReceipt for the
   * PO landed on/before expectedDeliveryDate.
   */
  private async computeRows(tx: Tx, tenantId: string, filters: AnalyticsFilters, search?: string): Promise<SupplierPerformanceRow[]> {
    const scope = {
      tenantId,
      warehouseId: filters.warehouseId,
      supplierId: filters.supplierId,
      orderDate: { gte: filters.from, lte: filters.to },
    };

    const suppliers = await tx.supplier.findMany({
      where: {
        tenantId,
        id: filters.supplierId,
        OR: search ? [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] : undefined,
      },
      select: { id: true, code: true, name: true },
    });
    if (suppliers.length === 0) return [];

    const [lines, receivedPos, openCounts] = await Promise.all([
      tx.purchaseOrderLine.findMany({
        where: { tenantId, purchaseOrder: scope },
        select: { qtyOrdered: true, unitCost: true, purchaseOrder: { select: { supplierId: true } } },
      }),
      tx.purchaseOrder.findMany({
        where: { ...scope, status: PurchaseOrderStatus.RECEIVED, expectedDeliveryDate: { not: null } },
        select: {
          supplierId: true,
          approvedAt: true,
          expectedDeliveryDate: true,
          goodsReceipts: { select: { receivedAt: true }, orderBy: { receivedAt: "desc" }, take: 1 },
        },
      }),
      tx.purchaseOrder.groupBy({ by: ["supplierId"], where: { ...scope, status: { in: OPEN_PO_STATUSES } }, _count: { _all: true } }),
    ]);

    const spendBySupplier = new Map<string, number>();
    for (const line of lines) {
      const supplierId = line.purchaseOrder.supplierId;
      spendBySupplier.set(supplierId, (spendBySupplier.get(supplierId) ?? 0) + line.qtyOrdered * decimalToNumber(line.unitCost));
    }

    const poCountBySupplier = new Map<string, number>();
    const poIdsSeen = await tx.purchaseOrder.findMany({ where: scope, select: { id: true, supplierId: true } });
    for (const po of poIdsSeen) {
      poCountBySupplier.set(po.supplierId, (poCountBySupplier.get(po.supplierId) ?? 0) + 1);
    }

    const openBySupplier = new Map(openCounts.map((row) => [row.supplierId, row._count._all]));

    const otifBySupplier = new Map<string, { eligible: number; onTime: number; late: number }>();
    for (const po of receivedPos) {
      if (!po.expectedDeliveryDate || po.goodsReceipts.length === 0) continue;
      const receivedAt = po.goodsReceipts[0].receivedAt;
      const onTime = receivedAt.getTime() <= po.expectedDeliveryDate.getTime();
      const entry = otifBySupplier.get(po.supplierId) ?? { eligible: 0, onTime: 0, late: 0 };
      entry.eligible += 1;
      if (onTime) entry.onTime += 1;
      else entry.late += 1;
      otifBySupplier.set(po.supplierId, entry);
    }

    const leadTimeBySupplier = new Map<string, number[]>();
    for (const po of receivedPos) {
      if (!po.approvedAt || po.goodsReceipts.length === 0) continue;
      const days = (po.goodsReceipts[0].receivedAt.getTime() - po.approvedAt.getTime()) / (24 * 60 * 60 * 1000);
      const list = leadTimeBySupplier.get(po.supplierId) ?? [];
      list.push(days);
      leadTimeBySupplier.set(po.supplierId, list);
    }

    return suppliers.map((supplier) => {
      const otif = otifBySupplier.get(supplier.id);
      const leadTimes = leadTimeBySupplier.get(supplier.id) ?? [];
      return {
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        poCount: poCountBySupplier.get(supplier.id) ?? 0,
        totalSpend: round2(spendBySupplier.get(supplier.id) ?? 0),
        openPoCount: openBySupplier.get(supplier.id) ?? 0,
        latePoCount: otif?.late ?? 0,
        avgLeadTimeDays: leadTimes.length ? round2(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : null,
        onTimePercent: otif ? safePercent(otif.onTime, otif.eligible) : null,
        // In-full is implied by RECEIVED status, so supplier OTIF == on-time-percent here (see class doc above).
        otifPercent: otif ? safePercent(otif.onTime, otif.eligible) : null,
      };
    });
  }
}
