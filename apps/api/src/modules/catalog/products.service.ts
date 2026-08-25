import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException } from "../../common/errors/app-exception";
import { withDuplicateCheck } from "../../common/errors/prisma-error";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateProductDto) {
    const { tenantId } = this.tenantContext.get();
    return withDuplicateCheck(`SKU "${dto.sku}" is already in use`, () =>
      withTenant(tenantId, (tx) =>
        tx.product.create({
          data: { tenantId, ...dto, uom: dto.uom ?? "EACH" },
        }),
      ),
    );
  }

  list(filters: { active?: boolean } = {}) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.product.findMany({ where: { tenantId, active: filters.active }, orderBy: { sku: "asc" } }),
    );
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const product = await withTenant(tenantId, (tx) => tx.product.findFirst({ where: { id, tenantId } }));
    if (!product) throw new NotFoundAppException("Product not found");
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const { tenantId } = this.tenantContext.get();
    await this.get(id);
    return withDuplicateCheck(`SKU "${dto.sku}" is already in use`, () =>
      withTenant(tenantId, (tx) => tx.product.update({ where: { id }, data: dto })),
    );
  }
}
