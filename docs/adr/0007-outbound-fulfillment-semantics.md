# ADR 0007: Outbound fulfillment semantics

## Status

Accepted — phase 2 outbound slice.

## Context

Physical fulfillment (decreasing on-hand stock) needs the same
correctness properties inbound receiving already has: append-only
movements, no double-application of a duplicate event, and a hard
rejection (not a silent clamp) of any request that would exceed what's
legally available — here, "available" means "what remains reserved on
this line," the outbound equivalent of "what remains ordered on this PO
line" for over-receipt.

A structural question specific to outbound: `Shipment.salesOrderId` is
`@unique` — a SalesOrder can only ever have one linked Shipment (matches
"no split fulfillment across multiple warehouses" / "no multi-shipment
allocation" in scope). But fulfillment itself supports multiple partial
calls (fulfill 400, then fulfill 200). A single Shipment record can't
represent two separate partial-fulfillment events, so the Shipment's own
`CREATED → BOOKED → IN_TRANSIT → ARRIVED → DELIVERED` lifecycle cannot be
what drives `SalesOrder.status`.

## Decision

**Fulfillment is decoupled from Shipment tracking.** `SalesOrderStatus`
has no `SHIPPED`/`DELIVERED` member (unlike `PurchaseOrderStatus`, which
mirrors the inbound Shipment's delivery). Physical fulfillment — and the
`SalesOrder.status` transition to `PARTIALLY_FULFILLED`/`FULFILLED` — is
driven purely by explicit `POST /sales-orders/:id/fulfill` calls. The
Shipment record is created and tracked (`POST /shipments {direction:
OUTBOUND}`) for transit visibility only, the same role it already plays
for inbound (Phase 1 never tied `PurchaseOrder.status` to Shipment
delivery for the *ledger* either — `PurchaseOrdersService.receive()` is
what moves stock, not `ShipmentsService.deliver()`). An outbound Shipment
may be created once the SalesOrder has any active allocation
(`ALLOCATED | PARTIALLY_FULFILLED | FULFILLED`), so warehouse staff can
book/dispatch as soon as *some* stock is ready to move, independent of
whether every unit has been fulfilled yet.

**Fulfillment is two-phase, mirroring `po.received` exactly:**

*Phase 1 — synchronous, `SalesOrdersService.fulfill()`.* Validates the
order is in `FULFILLABLE_STATUSES` (`ALLOCATED`/`PARTIALLY_FULFILLED` —
rejects DRAFT, CONFIRMED, CANCELLED, FULFILLED, matching the invariant
list in the task spec), then commits the quantity change with **one
atomic conditional update per line**:

```
salesOrderLine.updateMany({
  where: { id, tenantId, qtyReserved: { gte: qty } },
  data: { qtyReserved: { decrement: qty }, qtyFulfilled: { increment: qty } },
})
```

If `count === 0`, the guard failed — either the line isn't on this order,
or not enough remains reserved — and the handler throws
`SALES_ORDER_OVER_FULFILLMENT` before anything else changes. This is a
single round trip with no separate read-then-decide step (stronger than
"protected by a lock" — there's no read step to go stale at all), which
is why fulfillment doesn't need the `SELECT ... FOR UPDATE` machinery
reservation needs (see ADR 0006): the guard here is a single field on a
single row, not a derived cross-column condition evaluated across
multiple lines with a lock-ordering concern.

Once every requested line succeeds, the order's target status
(`PARTIALLY_FULFILLED` vs `FULFILLED`) is derived from whether every
line's `qtyFulfilled >= qtyOrdered` — the same pattern as
`PurchaseOrdersService.receive()` deriving `PARTIALLY_RECEIVED` vs
`RECEIVED`, not a static transition-table entry (the target genuinely
depends on runtime quantities).

*Phase 2 — async, `InventoryService.handleSalesOrderFulfilled`.* Claims
`eventId` via the existing `claimEvent()` helper (identical mechanism to
`handlePoReceived`) — a replayed event is a no-op. Then, per line, posts
one negative `StockMovement` (`type: FULFILLMENT`, reusing the existing
`postMovement`/`releaseReservedQty` helper unchanged) and increments the
matching `InventoryReservation.fulfilledQuantity`, flipping its `status`
to `FULFILLED` once fully consumed.

**Why the split doesn't need Phase 2 to re-check legality:**
over-fulfillment is a Fulfillment-side invariant about
`SalesOrderLine.qtyReserved`/`qtyOrdered`, fully enforced atomically in
Phase 1 *before* the event is even emitted. Phase 2's only job is applying
an already-proven-legal delta to the ledger exactly once — the two
concerns (is this quantity legal, and has this exact delta already been
applied) are cleanly separated between the two phases, so neither has to
re-derive the other's invariant.

**Reuses the existing `StockMovementType.FULFILLMENT` enum value** rather
than adding a new `CUSTOMER_FULFILLMENT` value — it already means exactly
"outbound movement caused by fulfilling a customer order," and there's no
other kind of fulfillment in this schema to disambiguate from.

## Consequences

- Traceability: `StockMovement.salesOrderLineId` → `SalesOrderLine` →
  `SalesOrder` → `Customer` is a direct FK chain, mirroring
  `purchaseOrderLineId`/`goodsReceiptLineId` for inbound (spec §13).
  Inbound traceability is untouched — those two FK columns are unchanged.
- Duplicate fulfillment events (a retried request, at-least-once
  redelivery) cannot double-decrement stock — verified by extending
  `inventory-idempotency.integration-spec.ts` with a
  `sales-order.fulfilled` case structured identically to the existing
  `po.received` one.
- Over-fulfillment is rejected atomically with no partial effect — verified
  in `sales-order-lifecycle.integration-spec.ts`.
