import { Controller, Get } from "@nestjs/common";
import { TenantContext } from "../../common/tenant/tenant-context";

/** Smoke-test endpoint: confirms TenantMiddleware resolved identity correctly. */
@Controller("me")
export class MeController {
  constructor(private readonly tenantContext: TenantContext) {}

  @Get()
  me() {
    return this.tenantContext.get();
  }
}
