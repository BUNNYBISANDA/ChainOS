# ADR 0002: Event idempotency

## Status

Accepted — phase 0.5.

## Context

`apps/api/src/common/events` is an in-process `EventEmitter2` bus
(`DomainEventsModule`) — deliberately not a broker, per the "modular
monolith" constraint. `EventEmitter2` has no persistence, no delivery
guarantee beyond "the handler ran," and no deduplication. Before phase
0.5, `PoReceivedPayload` (and the other inventory-mutating payloads) had
no `eventId` at all, and `InventoryService`'s handlers had no way to tell
a redelivery of an event apart from a new one. The stated requirement:
processing `po.received` for `eventId = X, qty = 1000` twice must result
in `+1000`, not `+2000` — and not via "fragile in-memory state."

Redelivery is a real scenario even in-process: a handler can be re-invoked
by a retry after a transient failure, or (as built) called directly by a
caller that legitimately might not know whether an earlier attempt
committed.

## Decision

A tenant-scoped `ProcessedEvent(tenantId, eventId, eventType)` table with
a `@@unique([tenantId, eventId])` constraint is the idempotency ledger —
Postgres enforces "seen it or not," not application memory. Every payload
that drives a state mutation now carries a stable `eventId`
(`crypto.randomUUID()`, generated once at the point of emission).

Each `@OnEvent` handler in `InventoryService` that mutates the ledger:

1. Opens **one** transaction via `withTenant` for the whole event (all
   lines), not one per line.
2. Inside it, `INSERT`s the `(tenantId, eventId)` claim row **first**.
3. If that insert loses the unique-constraint race (`P2002`), the event
   was already processed — return early, no-op, no error.
4. Otherwise, apply the ledger writes (`StockMovement` + `StockLevel`) in
   the same transaction.

Because the claim and the mutation commit or roll back together, there's
no window where a redelivered event sees a stale claim and reapplies —
this is safe under **concurrent** redelivery too (tested explicitly, not
just sequential), which an in-memory `Set<eventId>` guard would not be:
two concurrent handlers both checking-then-inserting into memory can both
pass the check before either writes; the Postgres constraint make that
race resolve to exactly one winner regardless of timing, and it survives
a process restart, which in-memory state doesn't.

`purchase-orders.service.ts` and `customer-orders.service.ts` also
switched their `events.emit(...)` calls to `events.emitAsync(...)`. Plain
`emit()` doesn't await async listeners — the original code fired an
`async handlePoReceived` without waiting for it, so the HTTP response
could return before the ledger write even ran, and a thrown error in the
handler became an unhandled rejection instead of a surfaced failure. This
was a latent reliability bug independent of idempotency; fixing it was
required to make the idempotency guarantee mean anything end-to-end.

## Consequences

- `ProcessedEvent` rows accumulate forever (no TTL/cleanup). Acceptable
  at phase 0.5 volume; revisit with a retention policy if event volume
  ever makes this table large enough to matter.
- The same pattern (claim-then-mutate, one transaction) is expected to be
  reused by any future handler that mutates state in reaction to a
  cross-module event — it's a general mechanism, not inventory-specific,
  even though inventory is the only consumer of it today.
