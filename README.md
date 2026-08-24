# ChainOS

Modular supply chain operating system — supplier through purchase order,
warehouse, inventory, shipment, and customer order. Architecture rationale,
the domain model, module boundaries, and the phased roadmap live in the
[ChainOS Manifest](https://claude.ai/code/artifact/af39c88f-4ab5-43e6-8081-b5b0abe99152).
This repo is the phase 0 scaffold described there.

## Structure

```
apps/
  api/            NestJS — one module per bounded context (see manifest §2)
  web/            Next.js — placeholder shell; real dashboards are phase 3
packages/
  database/       Prisma schema + tenant-scoped client (see manifest §1)
```

Modules under `apps/api/src/modules` communicate only through the event
bus (`apps/api/src/common/events`) — no module imports another module's
service directly. See `domain-events.ts` for the event contract.

## Getting started

Requires Node 20+, pnpm, and a local Postgres instance.

```bash
pnpm install
```

1. Create the database and an app role that does **not** have `BYPASSRLS`
   and is **not** the table owner (RLS silently no-ops for both):

   ```sql
   CREATE DATABASE chainos;
   CREATE ROLE chainos_app LOGIN PASSWORD 'password';
   GRANT CONNECT ON DATABASE chainos TO chainos_app;
   ```

2. Copy the env files and fill in your local connection string:

   ```bash
   cp packages/database/.env.example packages/database/.env
   cp apps/api/.env.example apps/api/.env
   ```

3. Run migrations, then apply row-level security:

   ```bash
   pnpm db:migrate
   psql "$DATABASE_URL" -f packages/database/prisma/rls.sql
   ```

4. Start everything:

   ```bash
   pnpm dev
   ```

   API on `:3001`, web on `:3000`.

## Not yet set up

- **Lint**: no shared ESLint config yet — add one (flat config, shared
  across `apps/api` and `packages/database`) before the module count grows.
- **Tests**: no test runner wired up. Jest ships with `@nestjs/cli`
  scaffolding if you `nest generate` new resources; add it explicitly
  otherwise.

## Auth note

`TenantMiddleware` (`apps/api/src/common/tenant/tenant.middleware.ts`) is a
phase-0 stub — it reads `x-tenant-id` / `x-user-id` headers directly with no
verification. Every mutating route requires `@RequirePermissions(...)`, but
the permission list is hardcoded empty until real auth resolves it from the
caller's `Role`. Do not deploy this past localhost as-is.
