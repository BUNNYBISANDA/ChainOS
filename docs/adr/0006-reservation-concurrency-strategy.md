# ADR 0006: Reservation concurrency strategy

## Status

Accepted — phase 2 outbound slice.

## Context

Phase 1's `InventoryService.handleOrderReserved` reserved stock with a
plain read-then-write: a `findFirst` availability check, then an
`increment` — no row lock in between. Two concurrent reservations against
the same product+warehouse could both read "100 available", both pass the
check, and both increment `quantityReserved` by their full amount,
oversubscribing stock. Phase 2's task spec makes closing this hole
mandatory: "impossible to end with Reserved = 160" against 100 on hand,
verified by a concurrent-request integration test.

Separately, the old flow committed the order's status change in its own
transaction *before* asking Inventory to reserve — a genuine
async-event-across-two-transactions design, the same shape as every other
cross-module interaction in this codebase (`po.received`,
`shipment.created`, ...). If Inventory's reaction later rejected for
insufficient stock, the order was already committed as reserved with
nothing behind it. This is the same underlying problem as the oversell
race — a decision made without holding the thing it depends on — just
manifesting as a correctness bug instead of a race condition.

## Decision

Two changes, at two different layers of the same problem:

**1. Lock the row before deciding.** `InventoryService.reserveForSalesOrder`
issues `SELECT ... FOR UPDATE` on the target `StockLevel` row (raw SQL via
`tx.$queryRaw`, running inside the caller's `withTenant` transaction/
connection, so RLS's `SET LOCAL app.tenant_id` still applies) *before*
computing `available = onHand - reserved`. A second concurrent call
against the same row blocks on the lock until the first transaction
commits or rolls back, then sees the post-commit value — the read used for
the decision can no longer be stale. This closes the oversell race
directly; whichever transaction loses the race sees updated numbers and
correctly fails with `INVENTORY_INSUFFICIENT_AVAILABLE_STOCK` if nothing
is left.

Multi-line orders lock rows in `productId` order (see
`SalesOrdersService.allocate()`) — a fixed, deterministic lock-acquisition
order across every caller means two concurrent allocations touching the
same set of products can never deadlock on each other.

Note this fix is scoped to the reservation path specifically. The plain
`increment`/`decrement` calls elsewhere in `InventoryService` (posting a
receipt, releasing a reservation) were never racy on their own — Postgres
executes `SET col = col + n` atomically per row regardless of concurrent
callers. The bug was always the separate *read* used to make a decision,
not the write itself; only reservation's availability check has that
shape.

**2. Make allocation genuinely all-or-nothing, in one transaction.**
`SalesOrdersService.allocate()` calls
`InventoryService.reserveForSalesOrder(tx, ...)` **synchronously, passing
its own transaction**, once per line — not via an async domain event. This
is a deliberate, narrow deviation from this codebase's otherwise-universal
rule that modules only talk to each other through `EventEmitter2`. It's
justified because the spec's own definition of `ALLOCATED` is an
invariant ("never mark ALLOCATED unless reservation succeeded"), and two
independently-committing transactions cannot guarantee that without a
saga/compensation mechanism — which this codebase has no precedent for and
the spec doesn't ask for. One shared Postgres transaction gets true
all-or-nothing behavior for free: if any line's reservation fails, the
thrown exception aborts the whole transaction, and every reservation
already made for earlier lines in the same call rolls back automatically.

Each module still only writes its own tables inside that shared
transaction — `InventoryService`'s code is the only code that touches
`StockLevel`/`InventoryReservation`, `SalesOrdersService`'s code is the
only code that touches `SalesOrder`/`SalesOrderLine` — the cross-module
boundary is a narrow method call (`reserveForSalesOrder`,
`releaseReservationsForSalesOrder`), not open access to another module's
tables. The async event (`sales-order.allocated`) still fires, but only
*after* the transaction commits, purely for observers — nothing depends on
it for correctness, exactly like `po.approved`/`stock.changed` today.

Fulfillment (see ADR 0007) keeps the async two-phase pattern, because its
correctness-critical invariant (no over-fulfillment) is enforced
atomically *before* the event is even emitted — the event's only job
there is applying an already-proven-legal delta, which async idempotent
replay handles well. Reservation doesn't have that luxury: the decision
*is* the correctness-critical part, and it has to happen exactly once,
inside the same commit as the state change it gates.

## Alternative considered and rejected

Depending on an injected interface/port (`INVENTORY_RESERVATION_PORT`)
rather than the concrete `InventoryService` class would be more
conventional hexagonal-architecture hygiene, and would make a future
"Inventory becomes its own service" split cheaper. Rejected for now:
nothing else in this modular monolith uses ports/interfaces for
intra-monolith DI (every module injects concrete classes directly, e.g.
`PurchaseOrdersService` injects `AuditService`), so introducing one
abstraction for this single call site would be inconsistent with house
style and premature given there's no near-term plan to split Inventory
out of the monolith.

## Consequences

- `reserveForSalesOrder`/`releaseReservationsForSalesOrder` are the only
  places in the codebase where one module's service method is called
  directly by another module's service, passing a live transaction. This
  is intentional and narrow, not a precedent for bypassing domain events
  generally — every other cross-module interaction keeps using
  `EventEmitter2` exactly as before.
- `InventoryModule` now `exports: [InventoryService]` (it exported
  nothing in phase 1) specifically to make this DI possible.
- Verified by `inventory-reservation-concurrency.integration-spec.ts`:
  two (and three) concurrent allocation attempts against a fixed pool of
  stock, asserting exactly the affordable number succeed and
  `StockLevel.quantityReserved` never exceeds `quantityOnHand`.
