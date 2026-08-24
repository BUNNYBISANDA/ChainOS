import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantContext } from "../tenant/tenant-context";
import { PERMISSIONS_KEY } from "./permissions.decorator";

/**
 * Checks the required permissions on a route (set via @RequirePermissions)
 * against the caller's permissions resolved onto TenantContext by
 * TenantMiddleware. A route with no @RequirePermissions is allowed through
 * — mark every mutating endpoint explicitly.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { permissions } = this.tenantContext.get();
    const hasAll = required.every((p) => permissions.includes(p));

    if (!hasAll) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(", ")}`);
    }

    return true;
  }
}
