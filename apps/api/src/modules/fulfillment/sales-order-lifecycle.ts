import { SalesOrderStatus } from "@chainos/database";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException } from "../../common/errors/app-exception";

/**
 * Explicit SalesOrder lifecycle (phase 2 outbound slice — see
 * docs/adr/0005-inventory-reservation-model.md). `FULFILLED` and
 * `CANCELLED` are terminal. CONFIRMED = commercial acceptance; ALLOCATED =
 * inventory reservation succeeded (never set otherwise — see
 * SalesOrdersService.allocate()). CANCELLED is reachable from every
 * non-terminal state except after it's fully FULFILLED — cancelling from
 * PARTIALLY_FULFILLED releases only the unfulfilled reservation remainder
 * (see docs/adr/0007), the fulfilled portion's history stays intact.
 *
 * Fulfilling itself doesn't go through `assertSalesOrderTransition`
 * directly (its target status — PARTIALLY_FULFILLED vs FULFILLED —
 * depends on quantities, decided in SalesOrdersService.fulfill()) but the
 * precondition ("can this order be fulfilled at all right now") is
 * `FULFILLABLE_STATUSES`, derived from this same map — same pattern as
 * `RECEIVABLE_STATUSES` in purchase-order-lifecycle.ts.
 */
const TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  [SalesOrderStatus.DRAFT]: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.CONFIRMED]: [SalesOrderStatus.ALLOCATED, SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.ALLOCATED]: [
    SalesOrderStatus.PARTIALLY_FULFILLED,
    SalesOrderStatus.FULFILLED,
    SalesOrderStatus.CANCELLED,
  ],
  [SalesOrderStatus.PARTIALLY_FULFILLED]: [SalesOrderStatus.FULFILLED, SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.FULFILLED]: [],
  [SalesOrderStatus.CANCELLED]: [],
};

export const FULFILLABLE_STATUSES: SalesOrderStatus[] = [SalesOrderStatus.ALLOCATED, SalesOrderStatus.PARTIALLY_FULFILLED];

/** Not yet fully fulfilled or cancelled — used for "Open SO" KPIs (phase 4 analytics) and dashboards alike. */
export const OPEN_SO_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.DRAFT,
  SalesOrderStatus.CONFIRMED,
  SalesOrderStatus.ALLOCATED,
  SalesOrderStatus.PARTIALLY_FULFILLED,
];

/** Committed but not yet fully fulfilled — the "Demand" side of the inventory-risk projection (phase 4 analytics). DRAFT is excluded: not yet commercially accepted. */
export const OPEN_DEMAND_SO_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.CONFIRMED,
  SalesOrderStatus.ALLOCATED,
  SalesOrderStatus.PARTIALLY_FULFILLED,
];

export function assertSalesOrderTransition(current: SalesOrderStatus, target: SalesOrderStatus): void {
  if (!TRANSITIONS[current].includes(target)) {
    throw new BadRequestAppException(
      AppErrorCode.SALES_ORDER_INVALID_TRANSITION,
      `Sales order cannot move from ${current} to ${target}`,
    );
  }
}
