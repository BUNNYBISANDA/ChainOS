# Outbound fulfillment (phase 2)

The outbound mirror of [phase 1's inbound slice](../adr/0004-purchase-order-lifecycle.md):
Customer → Sales Order → Confirm → Allocate (reserve) → Outbound Shipment →
Fulfill (partial or full). See the three ADRs below for the *why*; this
page is the *how it fits together*.

## Workflow

```
Customer (customerCode, e.g. CUS-2026-000001)
  -> Sales Order (orderNumber, e.g. SO-2026-000001)
       DRAFT -> CONFIRMED -> ALLOCATED -> PARTIALLY_FULFILLED -> FULFILLED
                                     \-------\--------------------> CANCELLED
```

- **DRAFT → CONFIRMED**: commercial acceptance only (`POST
  /sales-orders/:id/confirm`). No inventory involvement.
- **CONFIRMED → ALLOCATED**: `POST /sales-orders/:id/allocate` reserves
  every line's full ordered quantity, all-or-nothing, in one transaction —
  see [ADR 0006](../adr/0006-reservation-concurrency-strategy.md). Never
  reaches ALLOCATED if any line's reservation fails.
- **ALLOCATED → PARTIALLY_FULFILLED → FULFILLED**: `POST
  /sales-orders/:id/fulfill` with a per-line quantity, any number of
  times, decreasing on-hand stock and releasing the fulfilled portion of
  the reservation — see [ADR 0007](../adr/0007-outbound-fulfillment-semantics.md).
- **CANCELLED**: reachable from every non-terminal state via `POST
  /sales-orders/:id/cancel`. Releases whatever remains reserved (nothing,
  if cancelled before allocation; the full amount, if cancelled from
  ALLOCATED; only the unfulfilled remainder, if cancelled from
  PARTIALLY_FULFILLED) — never creates a StockMovement.

An **Outbound Shipment** (`POST /shipments {direction: OUTBOUND,
salesOrderId}`) may be created once the order has any active allocation.
`originWarehouseId` and `destCustomerId` are derived server-side from the
SalesOrder, never trusted from the client — the same discipline
`destWarehouseId` already gets for inbound. Its
`CREATED → BOOKED → IN_TRANSIT → ARRIVED → DELIVERED` lifecycle is
unchanged from phase 1 and tracks physical transit only; it does not drive
`SalesOrder.status` (see ADR 0007 for why one Shipment record can't
represent multiple partial fulfillments).

## Inventory invariants

At every point in the workflow:

```
Available = On Hand − Reserved
```

- `On Hand` only ever changes via an append-only `StockMovement`
  (`RECEIPT` inbound, `FULFILLMENT` outbound — negative delta).
- `Reserved` only ever changes via `InventoryReservation` create/release
  (allocate/cancel) or as a side effect of a `FULFILLMENT` movement
  (fulfill releases the fulfilled portion of the reservation in the same
  write that posts the movement). Reservation itself **never** creates a
  StockMovement — see [ADR 0005](../adr/0005-inventory-reservation-model.md).
- `StockLevel.quantityOnHand` always equals the sum of every physical
  `StockMovement.quantityDelta` for that product+warehouse — verified in
  every phase 2 test scenario via the shared `getStockReconciliation()`
  test helper.

## Reservation vs. fulfillment, concretely

Starting state: On Hand 1000, Reserved 0, Available 1000.

| Action | On Hand | Reserved | Available | SalesOrder status |
|---|---|---|---|---|
| allocate 600 | 1000 | 600 | 400 | ALLOCATED |
| fulfill 400 | 600 | 200 | 400 | PARTIALLY_FULFILLED |
| fulfill 200 | 400 | 0 | 400 | FULFILLED |

Cancelling instead of the second fulfill (from PARTIALLY_FULFILLED, after
only the first 400 was fulfilled): On Hand stays 600 (the fulfilled 400 is
real, permanent), Reserved drops to 0 (only the unfulfilled 200 is
released), Available becomes 600. The historical `-400` movement is never
touched.

## Permissions

Six new permission strings, matching the existing `po:create`/`po:approve`/
`po:receive` house style (singular resource, colon-separated action; GET
routes are never permission-gated, same rule as phase 1):

| Permission | Gates |
|---|---|
| `customer:write` | `POST /customers`, `PATCH /customers/:id` |
| `sales-order:create` | `POST /sales-orders` |
| `sales-order:confirm` | `POST /sales-orders/:id/confirm` |
| `sales-order:cancel` | `POST /sales-orders/:id/cancel` |
| `sales-order:allocate` | `POST /sales-orders/:id/allocate` |
| `sales-order:fulfill` | `POST /sales-orders/:id/fulfill` |

Outbound shipment actions reuse the existing `shipment:create`/
`shipment:update`.

| Role | New permissions | Rationale |
|---|---|---|
| Admin | all six | unchanged pattern |
| Procurement Manager | **none** | commercial procurement and commercial sales are separate concerns — same split as `po:approve` never being granted to Warehouse Manager |
| Warehouse Manager | `sales-order:allocate`, `sales-order:fulfill` | physical/inventory-adjacent actions, mirrors `po:receive` |
| Sales Manager *(new)* | `customer:write`, `sales-order:create`, `sales-order:confirm`, `sales-order:cancel` | commercial outbound actions, mirrors Procurement Manager's role on the inbound side |

## See also

- [ADR 0005](../adr/0005-inventory-reservation-model.md) — why
  `InventoryReservation` exists as a durable table, not just a counter.
- [ADR 0006](../adr/0006-reservation-concurrency-strategy.md) — the
  `SELECT ... FOR UPDATE` lock and the synchronous cross-module call that
  make allocation concurrency-safe.
- [ADR 0007](../adr/0007-outbound-fulfillment-semantics.md) — the
  two-phase fulfillment mechanism and why Shipment tracking is decoupled
  from it.
- [testing.md](./testing.md) — where each mandatory test scenario lives.
