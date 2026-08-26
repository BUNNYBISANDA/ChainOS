# ADR 0009: Analytics Read-Model Strategy

## Status

Accepted

## Context

Phase 4 needs cross-domain KPIs, OTIF, supplier performance, inventory risk, and an exception center spanning Procurement, Inventory, Fulfillment, and Logistics — without turning analytics into a fifth domain that mutates other domains' tables. Candidate strategies: (a) fetch full entity lists and compute in the browser (the existing `/dashboard` pattern — explicitly out of bounds for Phase 4), (b) Postgres materialized views refreshed on a schedule, (c) event-driven projection tables kept in sync by domain event handlers, (d) direct server-side aggregation queries against the existing transactional tables, computed on read.

## Decision

Option (d): a new `AnalyticsModule` (`apps/api/src/modules/analytics`) reads across domains with typed Prisma queries — `count`, `groupBy`, and scoped `findMany` — each wrapped in the same `withTenant(tenantId, tx => ...)` every other module uses. No `$queryRawUnsafe`. No new tables. No stored exception records outside the one Logistics already has (`ShipmentException`, from Phase 3) — procurement/fulfillment/inventory exceptions are computed on read from the same deterministic rules the KPIs use.

Where a KPI needs a value Prisma's aggregate API can't express (e.g. `qtyOrdered × unitCost` — a product of two columns, not summable via `_sum`), the query selects only the scalar columns needed for the already-filtered, already-indexed row set and reduces in the application layer. This is bounded by "rows matching an indexed filter," not "every row ever," and is documented per-service where it occurs.

Materialized views and event-driven projections were rejected for now:
- Current data volume is demo/seed-scale; direct aggregation is fast enough (see docs/architecture/analytics.md's index list).
- A projection can silently diverge from its source and needs its own rebuild/reconciliation machinery (spec §30–31). Direct aggregation has nothing to diverge — every read is computed from the current transactional state, so integration tests can assert against hand-computed expected values directly (see `apps/api/test/integration/analytics.integration-spec.ts`), which is a stronger guarantee than reconciling a projection against itself.

## Consequences

Analytics is read-only by construction — no `.create`/`.update`/`.delete` call exists anywhere in the module, so it cannot drift domain state. Every analytics number is traceable to a live query against the same tables the operational UI reads, which is what makes the Control Tower's numbers trustworthy rather than a second source of truth.

The tradeoff: some list-shaped endpoints (inventory risk, supplier performance) compute the full in-scope row set in memory before paginating, since neither risk classification nor OTIF is a stored column Postgres can `ORDER BY`/`LIMIT` directly. This is fine at the cardinality of "distinct SKU × warehouse combinations" or "distinct suppliers" for a single tenant today. If that cardinality grows into the thousands, the first thing to revisit is a materialized view (or a scheduled projection table) for exactly those two read shapes — not a wholesale rewrite of the analytics layer.
