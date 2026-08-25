# Authentication & request identity

Request flow, concretely:

```
Authorization: Bearer <access JWT>
        │
        ▼
AuthMiddleware (common/auth/auth.middleware.ts)
  verifies signature + expiry (JWT_ACCESS_SECRET)
  → { sub: userId, tenantId, permissions[] }
        │
        ▼
TenantContext.run({ tenantId, userId, permissions })
  (AsyncLocalStorage — common/tenant/tenant-context.ts)
        │
        ▼
PermissionsGuard (common/guards/permissions.guard.ts)
  checks @RequirePermissions(...) against ctx.permissions
        │
        ▼
Service calls withTenant(ctx.tenantId, tx => ...)
  (packages/database/src/index.ts)
        │
        ▼
Postgres: SET LOCAL app.tenant_id = '<uuid>' → RLS policy
```

Every step from `AuthMiddleware` down is unchanged from before phase 0.5
except the identity source — RLS is still the final layer (see
[rls.md](./rls.md)), and `PermissionsGuard` / `TenantContext` are the same
code, just now fed real, verified data instead of trusted headers.

## Issuing identity

`POST /auth/login` — see `apps/api/src/modules/iam/auth/`. Request:

```json
{ "organizationSlug": "siam-distribution", "email": "...", "password": "..." }
```

`organizationSlug` is required because `User.email` is only unique
**per tenant** (`@@unique([tenantId, email])`), not globally — see
[ADR 0001](../adr/0001-authentication.md) for why.

Response: a short-lived access token (15 min, permissions embedded), a
longer-lived refresh token (7 days, opaque to the client, single-use —
`POST /auth/refresh` rotates it and revokes the old one), and the
resolved user/tenant. `POST /auth/logout` revokes a refresh token
explicitly.

## apps/web: the BFF layer (phase 1)

```
Browser (cookies only, no JWT in JS)
        │  httpOnly access_token / refresh_token / chainos_user
        ▼
middleware.ts — decodes exp, proactively refreshes, redirects to /login if unauthenticated
        │
        ▼
Server Component (page) ──apiGet──┐
Server Action (mutation) ─apiPost─┤→ lib/api.ts attaches Authorization: Bearer <access_token>
                                   ▼
                          NestJS API (flow above)
```

`lib/actions/auth.ts` calls `/auth/login` / `/auth/logout` and sets the
three cookies; every other page/action reads them via `lib/api.ts` /
`lib/current-user.ts`. See
[ADR 0001](../adr/0001-authentication.md#nextjs-integration-built-in-phase-1)
for the full reasoning, including why there's no generic API proxy route
(Server Actions cover every mutation).
