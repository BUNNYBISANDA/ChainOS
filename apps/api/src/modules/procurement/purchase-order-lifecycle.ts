import { PurchaseOrderStatus } from "@chainos/database";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException } from "../../common/errors/app-exception";

/**
 * Explicit PO lifecycle (phase 1 inbound slice — see
 * docs/adr/0004-purchase-order-lifecycle.md). `RECEIVED` and `CANCELLED`
 * are terminal. Receiving itself doesn't go through `assertTransition`
 * directly (its target status — PARTIALLY_RECEIVED vs RECEIVED — depends
 * on quantities, decided in PurchaseOrdersService.receive) but the
 * precondition "can this PO be received at all right now" is
 * `RECEIVABLE_STATUSES`, derived from this same map.
 */
const TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.APPROVED]: [PurchaseOrderStatus.SHIPPED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.SHIPPED]: [
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.RECEIVED]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

export const RECEIVABLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.SHIPPED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

export function assertPoTransition(current: PurchaseOrderStatus, target: PurchaseOrderStatus): void {
  if (!TRANSITIONS[current].includes(target)) {
    throw new BadRequestAppException(
      AppErrorCode.PURCHASE_ORDER_INVALID_TRANSITION,
      `Purchase order cannot move from ${current} to ${target}`,
    );
  }
}
