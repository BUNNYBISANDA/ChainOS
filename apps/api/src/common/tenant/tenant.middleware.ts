import { Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TenantContext } from "./tenant-context";

/**
 * Resolves tenant + user + permissions for every request and makes them
 * available via TenantContext for the rest of the request lifecycle.
 *
 * Phase 0 stub: reads `x-tenant-id` / `x-user-id` headers directly so the
 * module skeleton is runnable without an auth provider wired up yet.
 * Replace with real JWT verification (session -> tenantId/userId/roles)
 * before this touches anything but localhost.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContext) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.header("x-tenant-id");
    const userId = req.header("x-user-id");

    if (!tenantId || !userId) {
      throw new UnauthorizedException("Missing tenant/user identity");
    }

    // TODO(phase 0->1): replace with permissions loaded from the caller's
    // Role once auth is real; empty for now so guards fail closed.
    this.tenantContext.run({ tenantId, userId, permissions: [] }, () => next());
  }
}
