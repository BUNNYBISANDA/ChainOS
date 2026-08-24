import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PurchaseOrderStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { DomainEvent, PoReceivedPayload } from "../../common/events/domain-events";
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from "./dto/create-purchase-order.dto";

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
  ) {}

  create(dto: CreatePurchaseOrderDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.purchaseOrder.create({
        data: {
          tenantId,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          status: PurchaseOrderStatus.ISSUED,
          issuedAt: new Date(),
          lines: {
            create: dto.lines.map((l) => ({
              tenantId,
              productId: l.productId,
              qtyOrdered: l.qtyOrdered,
              unitCost: l.unitCost,
            })),
          },
        },
        include: { lines: true },
      }),
    );
  }

  list() {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) => tx.purchaseOrder.findMany({ where: { tenantId }, include: { lines: true } }));
  }

  /**
   * Records receipt against PO lines and flips PO status. Does NOT touch
   * StockLevel/StockMovement directly — Procurement owns the PO, not
   * inventory. It emits `po.received`; the Inventory module's listener
   * (modules/inventory/inventory.service.ts) is what actually posts the
   * ledger entries. See manifest §2.
   */
  async receive(purchaseOrderId: string, dto: ReceivePurchaseOrderDto) {
    const { tenantId } = this.tenantContext.get();

    const result = await withTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, tenantId }, include: { lines: true } });
      if (!po) throw new NotFoundException("Purchase order not found");

      for (const receipt of dto.lines) {
        const line = po.lines.find((l) => l.id === receipt.purchaseOrderLineId);
        if (!line) throw new BadRequestException(`Unknown PO line ${receipt.purchaseOrderLineId}`);
        if (line.qtyReceived + receipt.qtyReceived > line.qtyOrdered) {
          throw new BadRequestException(`Receiving ${receipt.qtyReceived} on line ${line.id} would exceed qtyOrdered`);
        }
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { qtyReceived: { increment: receipt.qtyReceived } },
        });
      }

      const refreshedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
      const fullyReceived = refreshedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
      const status = fullyReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status } });

      return { po, warehouseId: po.warehouseId };
    });

    const payload: PoReceivedPayload = {
      tenantId,
      purchaseOrderId,
      warehouseId: result.warehouseId,
      lines: dto.lines.map((l) => ({
        purchaseOrderLineId: l.purchaseOrderLineId,
        productId: result.po.lines.find((line) => line.id === l.purchaseOrderLineId)!.productId,
        qtyReceived: l.qtyReceived,
      })),
    };
    this.events.emit(DomainEvent.PoReceived, payload);

    return payload;
  }
}
