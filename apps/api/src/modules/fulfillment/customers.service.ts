import { Injectable } from "@nestjs/common";
import { withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException } from "../../common/errors/app-exception";
import { withDuplicateCheck } from "../../common/errors/prisma-error";
import { nextDocumentNumber } from "../../common/numbering";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly tenantContext: TenantContext) {}

  /** customerCode is always server-generated (CUS-2026-000001, ...) — never accepted from the client, same as PO/shipment numbers. */
  create(dto: CreateCustomerDto) {
    const { tenantId } = this.tenantContext.get();
    return withDuplicateCheck("Customer code collision — please retry", () =>
      withTenant(tenantId, async (tx) => {
        const customerCode = await nextDocumentNumber(tx, tenantId, "CUS");
        return tx.customer.create({ data: { tenantId, customerCode, ...dto } });
      }),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.customer.findMany({ where: { tenantId }, orderBy: { customerCode: "asc" } }));
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const customer = await withTenant(tenantId, (tx) => tx.customer.findFirst({ where: { id, tenantId } }));
    if (!customer) throw new NotFoundAppException("Customer not found");
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const { tenantId } = this.tenantContext.get();
    await this.get(id);
    return withTenant(tenantId, (tx) => tx.customer.update({ where: { id }, data: dto }));
  }
}
