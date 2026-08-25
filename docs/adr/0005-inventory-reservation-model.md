# ADR 0005: Inventory reservation model

## Status

Accepted — phase 2 outbound slice.

## Context

Phase 1's `CustomerOrder` stub had no real reservation concept: `reserve()`
incremented `StockLevel.quantityReserved` directly with no durable record
of *why* stock was reserved, and no way to release only the unfulfilled
remainder of a partially-fulfilled order. Phase 2 needs to answer "what is
this specific quantity of reserved stock for" (traceability back to a
SalesOrder/SalesOrderLine), support partial fulfillment against a
reservation, and support partial release on cancellation — none of which
a single materialized counter can do on its own.

## Decision

`StockLevel.quantityReserved` stays a materialized total, same role it has
always played (`quantityOnHand` cache, one row per product+warehouse), but
it's no longer the only source of truth for reservation. A new
`InventoryReservation` table is the durable record, one row per
`SalesOrderLine`:

```
InventoryReservation
  salesOrderId, salesOrderLineId (unique — one reservation per line)
  productId, warehouseId
  quantity            -- fixed at allocation time, immutable after
  fulfilledQuantity    -- running counter, incremented by each fulfill() call
  status                -- ACTIVE | FULFILLED | CANCELLED
  createdAt, releasedAt
```

`quantity - fulfilledQuantity` is always "how much of this reservation is
still outstanding" — cancellation releases exactly that amount (see ADR
0007), never the full original `quantity`, which is what makes partial
cancellation after partial fulfillment correct.

**Reservation is explicitly not a `StockMovement`.** The append-only
ledger records physical change only (`RECEIPT`, `FULFILLMENT`); a
reservation is a commitment against future physical movement, not a
movement itself. Creating a movement to represent a reservation would
make the ledger's "sum of movements = on-hand" invariant lie about
physical reality.

`SalesOrderLine.qtyReserved`/`qtyFulfilled` are Fulfillment's own
bookkeeping copies (same pattern as `PurchaseOrderLine.qtyReceived` in
phase 1) — kept in sync with `InventoryReservation`'s numbers by
construction (see ADR 0006), not by a separate reconciliation step.

## Consequences

- Every reservation is traceable: a `StockMovement.salesOrderLineId` on a
  `FULFILLMENT` movement, combined with the matching
  `InventoryReservation` row, answers "why did stock decrease by N" all
  the way back to the SalesOrder and Customer (spec §13) — the same shape
  as phase 1's `GoodsReceiptLine` traceability for inbound.
- `InventoryReservation.salesOrderLineId` is `@unique`: a line can only
  ever have one reservation. This is a deliberate scope boundary matching
  "no split fulfillment across multiple warehouses" and "no
  multi-shipment allocation" — a line is allocated once, in full, against
  one warehouse, or not at all.
