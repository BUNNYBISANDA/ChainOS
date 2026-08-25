import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NextFunction, Request, Response } from "express";
import { TenantContext } from "../tenant/tenant-context";
import { UnauthenticatedAppException } from "../errors/app-exception";
import { AccessTokenPayload, getAccessTokenSecret } from "./jwt-payload";

/**
 * Resolves identity for every request from a signed access token —
 * `Authorized User -> Organization Membership -> Active Organization ->
 * RBAC -> Tenant Context` (see docs/adr for the authentication ADR).
 *
 * Replaces the phase 0 stub that trusted `x-tenant-id` / `x-user-id`
 * headers verbatim. Permissions are embedded in the token at login/refresh
 * (see AuthService) rather than re-fetched from the DB per request — the
 * token's short TTL (15 min) bounds how stale that can get. Tenant
 * isolation for every downstream query still goes through Postgres RLS
 * via `withTenant(ctx.tenantId, ...)`; this middleware only decides which
 * tenant a request is allowed to act as.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly jwt: JwtService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthenticatedAppException("Missing or malformed Authorization header");
    }

    const token = header.slice("Bearer ".length);
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token, { secret: getAccessTokenSecret() });
    } catch {
      throw new UnauthenticatedAppException("Invalid or expired access token");
    }

    this.tenantContext.run(
      { tenantId: payload.tenantId, userId: payload.sub, permissions: payload.permissions ?? [] },
      () => next(),
    );
  }
}
