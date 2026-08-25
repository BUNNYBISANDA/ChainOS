import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException } from "../../common/errors/app-exception";
import { withDuplicateCheck } from "../../common/errors/prisma-error";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";

@Injectable()
export class WarehousesService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateWarehouseDto) {
    const { tenantId } = this.tenantContext.get();
    return withDuplicateCheck(`Warehouse code "${dto.code}" is already in use`, () =>
      withTenant(tenantId, (tx) => tx.warehouse.create({ data: { tenantId, ...dto } })),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.warehouse.findMany({ where: { tenantId }, orderBy: { code: "asc" } }));
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const warehouse = await withTenant(tenantId, (tx) => tx.warehouse.findFirst({ where: { id, tenantId } }));
    if (!warehouse) throw new NotFoundAppException("Warehouse not found");
    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const { tenantId } = this.tenantContext.get();
    await this.get(id);
    return withDuplicateCheck(`Warehouse code "${dto.code}" is already in use`, () =>
      withTenant(tenantId, (tx) => tx.warehouse.update({ where: { id }, data: dto })),
    );
  }
}
