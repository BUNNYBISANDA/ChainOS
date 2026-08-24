import { SetMetadata } from "@nestjs/common";

export const PERMISSIONS_KEY = "permissions";

/** Marks a route as requiring one or more capability strings, e.g. `@RequirePermissions("po:create")`. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
