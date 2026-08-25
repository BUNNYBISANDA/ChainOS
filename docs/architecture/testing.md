# Testing

Jest, via `apps/api/jest.config.js`'s two projects.

## Unit tests (`pnpm test`)

Colocated with the code they test (`*.spec.ts` next to the source file).
No network, no database — `@chainos/database` is `jest.mock`ed, so these
run in milliseconds and exercise pure logic: permission checks, PO status
guards, and the inventory idempotency guard's decision logic (using an
in-memory fake transaction that reproduces Postgres's unique-constraint
behavior for `ProcessedEvent`, without a real database).

## Integration tests (`pnpm test:integration`)

`apps/api/test/integration/*.integration-spec.ts`. These boot the real
`AppModule` (via `@nestjs/testing` + `supertest`) and hit a real Postgres.

**Safety rule: there is no separate `TEST_DATABASE_URL`.** Integration
tests use whatever `DATABASE_URL` is active when you run them. Never run
`pnpm test:integration` against a database you care about — CI points it
at a disposable `postgres:16` service container that exists for the
duration of one workflow run (see `.github/workflows/ci.yml`). Each test
creates its own uniquely-slugged tenant(s) and deletes everything it
created in `afterAll`, so a run against a shared database is additive and
self-cleaning, but the safety margin is "don't do that," not "it's fully
sandboxed."

### Tenant isolation

`tenant-isolation.integration-spec.ts` creates two real tenants and
asserts, at three layers:

1. **Application layer** (real HTTP, real JWTs): Tenant A's `/suppliers`
   list excludes Tenant B's rows; `POST /purchase-orders/:id/receive`
   against Tenant B's PO id returns 404 for a Tenant A caller.
2. **Repository layer** (`withTenant`, no explicit `tenantId` filter):
   read/update/delete/relationship-traversal against Tenant B's supplier
   and PO, scoped to Tenant A, all resolve to "not found" — this is
   RLS doing the work, since the query itself doesn't filter by tenant.
3. **Raw SQL**: a `$queryRawUnsafe` `SELECT` against Tenant B's row,
   scoped to Tenant A, returns zero rows — proving the Postgres policy
   itself, independent of Prisma's query-builder conveniences.

Layers 2 and 3 only mean something if the connected role is actually
subject to RLS; see [rls.md](./rls.md) for how that's verified
(`isRlsEnforced()`) and what happens when it isn't (loud skip, not a
silent pass).

### Inventory idempotency

`inventory-idempotency.integration-spec.ts` calls
`InventoryService.handlePoReceived()` directly (bypassing the HTTP layer,
which would mint a fresh `eventId` per call) with the **same** `eventId`
delivered twice — sequentially and concurrently — and asserts the stock
delta is applied exactly once each time, against a real `ProcessedEvent`
unique constraint and a real transaction. See
[ADR 0002](../adr/0002-event-idempotency.md).

### Auth

`auth.integration-spec.ts` covers login (including wrong password / wrong
org), an authenticated round-trip through `/me`, refresh rotation (the
old refresh token stops working after use), and logout revocation.

### Purchase order lifecycle (phase 1)

`purchase-order-lifecycle.integration-spec.ts` drives the whole inbound
slice through the real HTTP API, the way the frontend does:

- Rejects `DRAFT -> RECEIVED` directly (no skipping `APPROVED`/`SHIPPED`).
- Full happy path: create -> approve (stamps `approvedByUserId`/`At`) ->
  create shipment (asserts `destWarehouseId` was derived from the PO,
  and that the PO flips to `SHIPPED` via the `shipment.created` event) ->
  book -> dispatch -> arrive -> receive 600 (asserts `PARTIALLY_RECEIVED`,
  real stock = 600) -> receive 400 (asserts `RECEIVED`, real stock =
  1000) -> deliver -> the ledger has exactly two `RECEIPT` movements.
- Over-receipt (1000 ordered, try 1001) rejects with
  `PURCHASE_ORDER_OVER_RECEIPT` and asserts nothing partially applied.
- A user with `po:receive` but not `po:approve` gets 403 attempting to
  approve — the permission split is real, not just documented.

## What CI runs, and why it's not just "your DATABASE_URL"

CI provisions a real non-superuser `chainos_app` Postgres role (see
`packages/database/scripts/ci-app-role.sql`) against the ephemeral
service container, so — unlike the shared cloud dev database — RLS is
genuinely enforced there, and the tenant-isolation assertions that only
mean something under a properly-scoped role actually run for real on
every PR.
