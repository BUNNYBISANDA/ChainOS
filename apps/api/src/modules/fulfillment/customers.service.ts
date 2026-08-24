import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateCustomerDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.customer.create({ data: { tenantId, ...dto } }));
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.customer.findMany({ where: { tenantId } }));
  }
}
