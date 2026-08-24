import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";

@Injectable()
export class WarehousesService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateWarehouseDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.warehouse.create({ data: { tenantId, ...dto } }));
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.warehouse.findMany({ where: { tenantId } }));
  }
}
