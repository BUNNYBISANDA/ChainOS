import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TenantContext } from "./tenant/tenant-context";
import { AuthMiddleware } from "./auth/auth.middleware";
import { AuditService } from "./audit/audit.service";

/**
 * Global so every feature module can inject TenantContext/AuditService
 * without each one importing it explicitly — it's request-scoped/shared
 * plumbing, not a feature dependency. Everything else stays module-local
 * by default.
 *
 * JwtModule.register({}) has no default secret/options — every sign/verify
 * call in AuthMiddleware and AuthService passes its own secret explicitly
 * (see common/auth/jwt-payload.ts), since access and refresh tokens use
 * different secrets.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TenantContext, AuthMiddleware, AuditService],
  exports: [TenantContext, AuthMiddleware, JwtModule, AuditService],
})
export class CommonModule {}
