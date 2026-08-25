# ChainOS

Modular supply chain operating system — supplier through purchase order,
warehouse, inventory, shipment, and customer order. Architecture rationale,
the domain model, module boundaries, and the phased roadmap live in the
[ChainOS Manifest](https://claude.ai/code/artifact/af39c88f-4ab5-43e6-8081-b5b0abe99152).
Phase 0 is the scaffold; phase 0.5 hardened it (real auth, tests, CI,
lint, a seed system, standardized errors); phase 1 (this state) is the
first vertical slice — the inbound flow, end to end, with a real UI:
Supplier → Product → Purchase Order → Approval → Inbound Shipment →
Receiving → Inventory Ledger → Stock Balance. See `docs/`.

## Structure

```
apps/
  api/            NestJS — one module per bounded context (see manifest §2)
  web/             Next.js App Router — Server Components + Server Actions,
                    no client-side API calls (see docs/architecture/authentication.md)
packages/
  database/       Prisma schema + tenant-scoped client (see manifest §1)
docs/
  architecture/   How things work: RLS, auth, errors, testing
  adr/            Why: numbered architecture decision records
```

Modules under `apps/api/src/modules` communicate only through the event
bus (`apps/api/src/common/events`) — no module imports another module's
service directly. See `domain-events.ts` for the event contract, and
[docs/adr/0002-event-idempotency.md](docs/adr/0002-event-idempotency.md)
for how duplicate delivery is handled.

## Getting started

Requires Node 20+, pnpm, and a local Postgres instance.

```bash
pnpm install
```

1. Create the database and an app role that does **not** have `BYPASSRLS`
   and is **not** the table owner (RLS silently no-ops for both — see
   [docs/architecture/rls.md](docs/architecture/rls.md)):

   ```sql
   CREATE DATABASE chainos;
   CREATE ROLE chainos_app LOGIN PASSWORD 'password';
   GRANT CONNECT ON DATABASE chainos TO chainos_app;
   ```

2. Copy the env files and fill in your local connection string and JWT
   secrets:

   ```bash
   cp packages/database/.env.example packages/database/.env
   cp apps/api/.env.example apps/api/.env
   ```

   Generate real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` values (see
   the comment in `apps/api/.env.example`) — don't ship the placeholders.

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   `apps/web`'s `API_URL` just needs to point at the running API
   (`http://localhost:3001` by default) — it's server-side only, never
   sent to the browser.

3. Run migrations, apply row-level security, then seed:

   ```bash
   pnpm db:migrate
   pnpm --filter @chainos/database rls
   pnpm db:seed
   ```

   (`rls` runs `packages/database/scripts/apply-rls.js`, equivalent to
   `psql "$DATABASE_URL" -f packages/database/prisma/rls.sql` if you'd
   rather use `psql` directly. `db:seed` creates one dev tenant — Siam
   Distribution Co., Ltd. — with three users, one supplier (Shenzhen
   Components Ltd.), one product (ELEC-001), one warehouse (BKK-DC-01),
   and a single **DRAFT** purchase order (1000 × ELEC-001) — deliberately
   left at DRAFT so the approve → ship → receive flow can be walked
   through live from the UI. See `packages/database/prisma/seed.ts` for
   credentials. It's idempotent; `pnpm db:reset` drops, re-migrates, and
   reseeds from scratch.)

4. Start everything:

   ```bash
   pnpm dev
   ```

   API on `:3001`, web on `:3000`.

## Quality gates

```bash
pnpm lint              # eslint.config.mjs, shared across all workspaces
pnpm typecheck
pnpm test              # unit tests — fast, no database
pnpm test:integration  # real Postgres; see docs/architecture/testing.md
pnpm build
```

CI (`.github/workflows/ci.yml`) runs all of the above on every PR and
push to `main`, against an ephemeral Postgres with a properly
least-privilege role — see
[docs/architecture/testing.md](docs/architecture/testing.md).

## Deployment

`apps/api` is set up for [Prisma Compute](https://www.prisma.io/docs) —
`prisma.compute.ts` holds its config, project `proj_cmt6yf5h716tr5nc3pekh4dex`
("ChainOS", `ap-southeast-1`) already has its primary database provisioned,
migrated, and RLS-applied (**but see the known gap below**). Deploy with:

```bash
cd apps/api
npx @prisma/cli@latest app deploy --project proj_cmt6yf5h716tr5nc3pekh4dex
```

As of this writing the local build step of `@prisma/cli@3.0.0-beta.30`
has a reproducible bug on Windows: it scans the whole user profile
directory instead of just the project, and crashes (`EBUSY` on a file
locked by an unrelated running app, then a Node OOM) before finishing.
Filed as CLI feedback (`prisma-cli feedback`, id `01a032fc-b74e-7000-93eb-508dfae643d2`).
Worth trying again once the CLI updates, or from WSL/Linux/macOS/CI where
this class of Windows file-locking issue doesn't apply.

**Known gap:** the provisioned Prisma Postgres database's connection role
(`prisma_migration`) is a restricted superuser and bypasses RLS entirely
— confirmed empirically, not just by reading role flags. Prisma Postgres
doesn't allow provisioning a least-privilege role via SQL from this
environment. **Do not point production traffic at this database until a
properly-scoped role is provisioned** (via Prisma's dashboard/API) — see
[docs/architecture/rls.md](docs/architecture/rls.md#known-gap-the-shared-cloud-dev-database).

## Auth

Real JWT authentication (phase 0.5) plus a Next.js BFF that owns the
cookies and never exposes a token to the browser (phase 1) — see
[docs/architecture/authentication.md](docs/architecture/authentication.md)
and [docs/adr/0001-authentication.md](docs/adr/0001-authentication.md).
