import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { AuthModule } from "./auth/auth.module";

/** Owns: tenants, users, roles/permissions, authentication (see manifest §2 table). */
@Module({
  imports: [AuthModule],
  controllers: [MeController],
})
export class IamModule {}
