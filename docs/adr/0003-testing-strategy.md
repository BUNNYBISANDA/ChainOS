# ADR 0003: Testing strategy

## Status

Accepted — phase 0.5.

## Context

Phase 0 had no test infrastructure at all. The API is NestJS; the domain
logic that most needs coverage (tenant isolation, event idempotency,
PO/order status transitions) lives in services that talk to Postgres
through Prisma + RLS, not in isolated pure functions — a unit-test-only
strategy can't actually verify the two invariants this hardening pass is
gated on (tenant isolation, idempotency), since both depend on real
Postgres behavior (RLS policies, unique constraints under concurrency).

## Decision

**Jest**, as the NestJS-idiomatic default (`@nestjs/testing` is built for
it), split into two Jest *projects* in one config
(`apps/api/jest.config.js`) rather than two separate tools:

- **`unit`** — colocated `*.spec.ts`, `@chainos/database` mocked, no
  network. Fast, for logic that doesn't need to prove anything about
  Postgres itself (guard behavior, status-transition validation, the
  idempotency *decision logic* against an in-memory fake that reproduces
  Postgres's unique-constraint semantics).
- **`integration`** — `apps/api/test/integration/*.integration-spec.ts`,
  boots the real `AppModule`, hits real Postgres. This is where tenant
  isolation and idempotency are actually proven, because "RLS blocks
  this" and "the unique constraint dedupes this" are claims about
  Postgres, not about TypeScript.

No separate `TEST_DATABASE_URL` — integration tests use whatever
`DATABASE_URL` is active. See [testing.md](../architecture/testing.md)
for the safety rule this implies and what it caught (see below).

## What this caught

Building the integration suite — not the application code — surfaced
three real, previously-undetected bugs, all now fixed:

1. `CommonModule` didn't export `JwtModule`, so `AuthMiddleware` failed
   to resolve `JwtService` — **the app didn't actually boot**. Unit
   tests, which construct services directly via `Test.createTestingModule`
   with hand-picked providers, can't catch a full-module DI wiring bug;
   only booting the real `AppModule` does.
2. `StockLevel` upserts used a composite-unique `where` with
   `locationId: null` — Prisma rejects `null` there at runtime (`Argument
   locationId must not be null`), because a nullable component of a
   composite unique index isn't reliably matchable that way. Every
   warehouse-level stock write (the only kind that exists before phase
   1.5's bin tracking) was broken against a real database, despite
   type-checking and building cleanly. Fixed by an explicit
   find-then-create-or-update instead of relying on the composite-unique
   `where`.
3. The connected dev database role (`prisma_migration`, a Prisma Postgres
   managed superuser) bypasses RLS entirely — see
   [rls.md](../architecture/rls.md). A unit test can't discover this; it
   only shows up when you actually try to violate isolation against the
   real database and it doesn't stop you.

This is the actual argument for the integration layer existing at all:
none of these three were reachable by testing logic in isolation.

## Consequences

- CI must provision a real, correctly-scoped Postgres role (not just
  "a Postgres"), or the tenant-isolation assertions verify nothing. See
  `.github/workflows/ci.yml` + `packages/database/scripts/ci-app-role.sql`.
- Integration tests are slower and network-dependent by nature; they're a
  separate `pnpm test:integration` script (not part of the default
  `pnpm test`) so a fast inner-loop stays fast, with CI running both.
