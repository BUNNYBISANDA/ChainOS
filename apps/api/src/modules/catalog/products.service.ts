import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { CreateProductDto } from "./dto/create-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateProductDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.product.create({
        data: { tenantId, sku: dto.sku, name: dto.name, uom: dto.uom ?? "EACH" },
      }),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.product.findMany({ where: { tenantId } }));
  }
}
