import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { CreateSupplierDto } from "./dto/create-supplier.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateSupplierDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.supplier.create({ data: { tenantId, ...dto } }));
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.supplier.findMany({ where: { tenantId } }));
  }
}
