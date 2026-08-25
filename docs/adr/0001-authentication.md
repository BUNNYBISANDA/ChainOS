# ADR 0001: Authentication approach

## Status

Accepted — phase 0.5 (API), extended in phase 1 (Next.js BFF integration).

## Context

Phase 0 shipped a stub: `TenantMiddleware` trusted `x-tenant-id` /
`x-user-id` headers verbatim, with an explicit `TODO` to replace it
before the API touched anything but localhost. `PermissionsGuard` and
`TenantContext` (`AsyncLocalStorage`) were already real and needed to
keep working unchanged — only the source of the identity they consume
needed to change.

The schema models identity as `User.tenantId` — a direct FK, one tenant
per user, `email` unique only `@@unique([tenantId, email])`. There is no
`Membership`/multi-org join table.

## Decision

JWT-based authentication owned entirely by the NestJS API:

- **Password hashing**: `bcryptjs` (pure JS — avoids native build/`node-gyp`
  friction across the monorepo's Windows dev / Linux CI split for a
  dependency that only needs to run a handful of times per request).
- **Access token**: 15 minutes, signed with `JWT_ACCESS_SECRET`, carries
  `{ sub: userId, tenantId, permissions[] }`. Permissions are embedded
  rather than fetched from the DB on every request — a stateless token
  read is cheaper than a DB round trip per request, and the short TTL
  bounds how stale a permission change can be. This trades a small
  staleness window for avoiding a DB hit on every single request; revisit
  if permission changes ever need to take effect faster than 15 minutes.
- **Refresh token**: 7 days, signed with a *different* secret
  (`JWT_REFRESH_SECRET`), single-use and rotated on every refresh — the
  raw token is never stored, only `sha256(token)` in `RefreshToken`, so a
  leaked database doesn't hand out usable tokens. Rotation means a stolen
  refresh token stops working the moment the legitimate client refreshes
  again, without needing a revocation list.
- **"Active Organization" resolution**: since a user belongs to exactly
  one tenant today, login requires `organizationSlug` explicitly (email
  alone can't disambiguate — it's only unique per tenant). This is the
  entire "Active Organization" step for phase 0.5; there is no org
  switcher because there is nothing to switch between yet.
- **"Organization Membership"**: realized as the existing `User.tenantId`
  relation. No new `Membership` table — introducing one now, before any
  product requirement needs multi-org users, would be schema surgery
  without a driving use case. If/when a user needs to belong to more than
  one tenant, that's the trigger to revisit this ADR, not before.

### Next.js integration (built in phase 1)

`apps/web` is a Server Components app that implements exactly the BFF
shape sketched above, now that there's a UI to need it:

- `lib/actions/auth.ts` (`loginAction`/`logoutAction`, both Server
  Actions) call `/auth/login` / `/auth/logout` directly and set
  `access_token`, `refresh_token`, and `chainos_user` as httpOnly,
  `SameSite=Lax` cookies via `next/headers` `cookies()`. The browser never
  receives a JWT in a script-readable form.
- `middleware.ts` decodes the access token's `exp` claim (no signature
  check — that's not a security boundary here, just a UX one) on every
  request and proactively calls `/auth/refresh` when it's missing or
  expiring within 60s, before the request reaches a page. This is why a
  15-minute access token doesn't mean the user re-authenticates every 15
  minutes.
- `lib/api.ts`'s `apiGet`/`apiPost`/`apiPatch` read the access token
  cookie server-side and attach it as `Authorization: Bearer` — every
  page (Server Component) and mutation (Server Action) calls the NestJS
  API this way. There is no client-side fetch to the API anywhere, and no
  generic passthrough proxy route — Server Actions cover every mutation
  this phase needs.

## Consequences

- RLS remains the final isolation layer regardless of anything above —
  nothing here bypasses `withTenant`/`SET LOCAL app.tenant_id`.
- A user's permissions can lag a role change by up to 15 minutes (access
  token TTL). Logout / refresh gives an immediate path to force a
  refresh if that's ever needed operationally.
- Multi-org membership is not supported. Documented as a known,
  deliberate limitation rather than an oversight.
