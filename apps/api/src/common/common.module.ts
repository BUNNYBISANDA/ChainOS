import { Global, Module } from "@nestjs/common";
import { TenantContext } from "./tenant/tenant-context";

/**
 * Global so every feature module can inject TenantContext without each
 * one importing it explicitly — it's request-scoped plumbing, not a
 * feature dependency. Everything else stays module-local by default.
 */
@Global()
@Module({
  providers: [TenantContext],
  exports: [TenantContext],
})
export class CommonModule {}
