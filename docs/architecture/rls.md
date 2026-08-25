# Row-level security

Every tenant-scoped table carries `tenantId` and a Postgres RLS policy
(`packages/database/prisma/rls.sql`):

```sql
CREATE POLICY tenant_isolation ON <table>
  USING ("tenantId" = current_setting('app.tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text)
```

`withTenant(tenantId, fn)` (`packages/database/src/index.ts`) is the only
sanctioned way to run a query: it opens a transaction, runs
`SET LOCAL app.tenant_id = '<uuid>'`, then hands you the transaction client.
Every service in `apps/api` goes through it. RLS then filters every
statement against that tenant even if the query forgets a `WHERE` clause —
it's a second, independent layer under the application's own `tenantId`
filtering, not a replacement for it.

## The one rule that makes this actually work

**The database role the app (and tests) connect as must not be a
superuser and must not have `BYPASSRLS`.** Both silently bypass every
policy above, regardless of `FORCE ROW LEVEL SECURITY`. The role also
should not own the tables (owners bypass RLS by default too) — it should
hold `GRANT SELECT, INSERT, UPDATE, DELETE` from a separate
migration/owner role instead. See `README.md` for local setup and
`packages/database/scripts/ci-app-role.sql` for how CI provisions this.

## Known gap: the shared cloud dev database

As of phase 0.5, the project's dev `DATABASE_URL` (Prisma Postgres /
Prisma Data Platform) connects as `prisma_migration`, a **restricted
superuser** — confirmed by querying `pg_roles` and by empirically
observing that a cross-tenant read/update/delete against `suppliers`
succeeds under it. RLS policies are present and correctly defined there,
but not enforced for this connection. Prisma Postgres does not allow
`CREATE ROLE` / `DROP ROLE` from application SQL (`ERROR: restricted
superuser cannot create roles`) — provisioning a least-privilege role
requires Prisma's own dashboard/API, not raw SQL, and wasn't reachable
from this environment. **This must be fixed before anything resembling
production traffic touches that database.**

This does not affect correctness elsewhere:

- **CI** provisions and connects as a real least-privilege `chainos_app`
  role against an ephemeral `postgres:16` service container (see
  `.github/workflows/ci.yml` and `ci-app-role.sql`), so RLS is genuinely
  enforced where the test suite's tenant-isolation assertions actually
  gate the build.
- **Integration tests** (`apps/api/test/integration/tenant-isolation.integration-spec.ts`)
  probe the connected role via `isRlsEnforced()` and self-skip (with a
  loud console warning, not a silent pass) the assertions that depend on
  RLS alone when it isn't enforced — while still asserting the
  application-layer authorization (explicit `tenantId` filters, 404 on
  cross-tenant access by id) unconditionally, since that layer doesn't
  depend on the DB role.

## Defense in depth, not either/or

Application code should keep filtering by `tenantId` explicitly wherever
it's reading/writing a specific row (as every service already does) —
RLS is the backstop for the query that forgets, not a license to drop the
explicit filter. Both layers are tested; see
[testing.md](./testing.md#tenant-isolation).
