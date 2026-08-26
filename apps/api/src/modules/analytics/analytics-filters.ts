import { ShipmentDirection } from "@chainos/database";
import { resolveDateRange, type ResolvedDateRange } from "./analytics.util";

/**
 * Raw query params every analytics route accepts (spec §7). `tenantId` is
 * deliberately never part of this shape — it always comes from
 * TenantContext, never from the client (spec §37).
 */
export interface AnalyticsQuery {
  range?: string;
  from?: string;
  to?: string;
  warehouseId?: string;
  supplierId?: string;
  customerId?: string;
  direction?: ShipmentDirection;
}

export interface AnalyticsFilters extends ResolvedDateRange {
  warehouseId?: string;
  supplierId?: string;
  customerId?: string;
  direction?: ShipmentDirection;
}

export function parseAnalyticsFilters(query: AnalyticsQuery): AnalyticsFilters {
  const range = resolveDateRange(query);
  return {
    ...range,
    warehouseId: query.warehouseId || undefined,
    supplierId: query.supplierId || undefined,
    customerId: query.customerId || undefined,
    direction: query.direction || undefined,
  };
}

export interface PageQuery {
  page?: string;
  pageSize?: string;
}

export interface ResolvedPage {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parsePage(query: PageQuery): ResolvedPage {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(query.pageSize ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
