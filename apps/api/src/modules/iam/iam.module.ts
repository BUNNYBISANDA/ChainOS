import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";

/**
 * Owns: tenants, users, roles/permissions (see manifest §2 table).
 * Auth (JWT issuance/verification) belongs here too once it moves past
 * the TenantMiddleware stub in common/tenant — see the TODO there.
 */
@Module({
  controllers: [MeController],
})
export class IamModule {}
