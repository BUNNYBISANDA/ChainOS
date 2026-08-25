import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";

export interface RequestContext {
  tenantId: string;
  userId: string;
  permissions: string[];
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Per-request tenant/user context, populated by AuthMiddleware (see
 * common/auth/auth.middleware.ts) for every inbound HTTP request from a
 * verified access token. Every module reads the current tenant from here
 * rather than threading it through method params — keeps service methods
 * honest about not needing it explicitly while still making
 * `withTenant(ctx.tenantId, ...)` (see @chainos/database) mandatory at the
 * repository boundary.
 */
@Injectable()
export class TenantContext {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  get(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error("TenantContext accessed outside of a request — is TenantMiddleware wired up?");
    }
    return ctx;
  }
}
