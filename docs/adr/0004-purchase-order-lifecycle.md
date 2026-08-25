# ADR 0004: Purchase order and shipment lifecycle

## Status

Accepted — phase 1 inbound slice.

## Context

Phase 0.5 had no PO lifecycle at all — `create()` auto-set every PO to
`ISSUED` and `receive()` had no status guard. Phase 1 needs a real
approval gate (only Admin/Procurement Manager can approve — task spec)
and a receiving workflow that supports partial receipts without ever
exceeding the ordered quantity. Shipment tracking needed an equivalent
explicit lifecycle (manual, no carrier integration — decision already
locked in the manifest).

## Decision

**Explicit state machines**, not a free-text status column. Both
`purchase-order-lifecycle.ts` and `shipment-lifecycle.ts` define a
`Record<Status, Status[]>` transition table and an `assert*Transition()`
guard that every mutation goes through — an invalid jump (e.g.
`DRAFT -> RECEIVED`) throws `PURCHASE_ORDER_INVALID_TRANSITION` /
`SHIPMENT_INVALID_TRANSITION` before anything is written.

```
PurchaseOrder: DRAFT -> APPROVED -> SHIPPED -> PARTIALLY_RECEIVED -> RECEIVED
                  \-------------------\-----------\------------------> CANCELLED
Shipment:      CREATED -> BOOKED -> IN_TRANSIT -> ARRIVED -> DELIVERED
                  \----------\-----------\---------------------------> CANCELLED
```

Receiving itself doesn't go through `assertPoTransition` directly — its
target status (`PARTIALLY_RECEIVED` vs `RECEIVED`) depends on quantities
received, decided in `PurchaseOrdersService.receive()`. The *precondition*
("can this PO be received at all") is `RECEIVABLE_STATUSES = [SHIPPED,
PARTIALLY_RECEIVED]`, derived from the same transition table so the two
can't drift apart.

### Who moves a PO to SHIPPED

Creating a shipment is a Logistics action, but flipping the PO to
`SHIPPED` is a write to a Procurement-owned table — Logistics may not do
that directly (manifest §1 module-boundary rule). `ShipmentsService`
instead emits `shipment.created` on creation; `PurchaseOrdersService`
subscribes and performs the transition itself, guarded by the same
`ProcessedEvent` idempotency mechanism as `po.received`
([ADR 0002](./0002-event-idempotency.md)) — this is a state-mutating
cross-module reaction like any other, so it gets the same treatment, not
a special case.

### Approval authorization

`po:approve` is a distinct permission from `po:create`/`po:receive`,
granted to Admin and Procurement Manager but not Warehouse Manager in the
seed roles — enforced by `@RequirePermissions("po:approve")` on the route
exactly like every other mutating endpoint, not a bespoke check. An
`AuditLog` entry (`purchase_order.approve` / `purchase_order.cancel`) is
written in the same transaction as the status change, alongside the
existing `approvedByUserId`/`approvedAt` columns — the audit trail is a
durable "who did what" record independent of those two columns, which
only capture the most recent approval.

### Receiving traceability

Each receiving action creates one `GoodsReceipt` (+ `GoodsReceiptLine`
per line) before emitting `po.received` — the event payload carries both
`receiptId` and a per-line `goodsReceiptLineId`, and `StockMovement` gets
a `goodsReceiptLineId` FK. This means a specific ledger movement can be
traced back to the exact receiving action that caused it (which PO line,
which receipt, received by whom, when) without Inventory needing to read
Procurement's tables — the ids are just payload fields, not a live query
across the module boundary.

## Consequences

- Over-receipt is a hard rejection (`PURCHASE_ORDER_OVER_RECEIPT`), never
  a silent clamp — matches the task spec exactly ("Never allow total
  received quantity to exceed ordered quantity... Return a domain
  validation error").
- A PO can only ever have one linked `Shipment` (`purchaseOrderId` is
  `@unique` on `Shipment` — pre-existing Phase 0 constraint, still holds).
  Multi-shipment POs (split shipments) are out of scope for phase 1.
- Building the integration test for this flow through the real HTTP API
  is what caught that `ShipmentsService` needed to derive
  `destWarehouseId` from the PO rather than trust the client, and that
  the `shipment.created` handler needed its own idempotency guard —
  neither was obvious from reading the code in isolation.
