import { Injectable } from "@nestjs/common";
import { PurchaseOrderStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { NotFoundAppException } from "../../common/errors/app-exception";
import { withDuplicateCheck } from "../../common/errors/prisma-error";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly tenantContext: TenantContext) {}

  create(dto: CreateSupplierDto) {
    const { tenantId } = this.tenantContext.get();
    return withDuplicateCheck(`Supplier code "${dto.code}" is already in use`, () =>
      withTenant(tenantId, (tx) => tx.supplier.create({ data: { tenantId, ...dto } })),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.supplier.findMany({ where: { tenantId }, orderBy: { code: "asc" } }));
  }

  /**
   * Basic info + every PO for this supplier + two rollups: outstanding
   * purchase value (ordered-but-not-yet-received, across non-cancelled
   * POs) and a historical order count. No supplier scoring — out of
   * scope for phase 1 (see task spec).
   */
  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const supplier = await withTenant(tenantId, (tx) =>
      tx.supplier.findFirst({
        where: { id, tenantId },
        include: {
          purchaseOrders: {
            include: { lines: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    );
    if (!supplier) throw new NotFoundAppException("Supplier not found");

    const { purchaseOrders, ...basic } = supplier;
    let outstandingValue = 0;
    for (const po of purchaseOrders) {
      if (po.status === PurchaseOrderStatus.CANCELLED) continue;
      for (const line of po.lines) {
        const outstandingQty = line.qtyOrdered - line.qtyReceived;
        outstandingValue += outstandingQty * Number(line.unitCost);
      }
    }

    return {
      ...basic,
      purchaseOrders: purchaseOrders.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        orderDate: po.orderDate,
        currency: po.currency,
        totalValue: po.lines.reduce((sum, l) => sum + l.qtyOrdered * Number(l.unitCost), 0),
      })),
      outstandingValue,
      orderCount: purchaseOrders.length,
    };
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const { tenantId } = this.tenantContext.get();
    await this.get(id);
    return withDuplicateCheck(`Supplier code "${dto.code}" is already in use`, () =>
      withTenant(tenantId, (tx) => tx.supplier.update({ where: { id }, data: dto })),
    );
  }
}
