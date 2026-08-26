import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { PurchaseOrderStatus, withTenant } from "@chainos/database";
import { TenantContext } from "../../common/tenant/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { AppErrorCode } from "../../common/errors/app-error-code";
import { BadRequestAppException, NotFoundAppException } from "../../common/errors/app-exception";
import { claimEvent } from "../../common/events/claim-event";
import { nextDocumentNumber } from "../../common/numbering";
import { DomainEvent, PoApprovedPayload, PoReceivedPayload, ShipmentCreatedPayload } from "../../common/events/domain-events";
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { OPEN_PO_STATUSES, RECEIVABLE_STATUSES, assertPoTransition } from "./purchase-order-lifecycle";

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreatePurchaseOrderDto) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const poNumber = await nextDocumentNumber(tx, tenantId, "PO");
      return tx.purchaseOrder.create({
        data: {
          tenantId,
          poNumber,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          currency: dto.currency ?? "THB",
          notes: dto.notes,
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          status: PurchaseOrderStatus.DRAFT,
          lines: {
            create: dto.lines.map((l) => ({
              tenantId,
              productId: l.productId,
              qtyOrdered: l.qtyOrdered,
              unitCost: l.unitCost,
            })),
          },
        },
        include: { lines: true, supplier: true, warehouse: true },
      });
    });
  }

  /** `overdue` (phase 4 analytics drill-down): open PO whose expected delivery date has passed — see docs/analytics/kpi-definitions.md. */
  list(filters: { status?: PurchaseOrderStatus; supplierId?: string; warehouseId?: string; from?: string; to?: string; overdue?: boolean }) {
    const { tenantId } = this.tenantContext.get();
    return withTenant(tenantId, (tx) =>
      tx.purchaseOrder.findMany({
        where: {
          tenantId,
          status: filters.overdue ? { in: OPEN_PO_STATUSES } : filters.status,
          supplierId: filters.supplierId,
          warehouseId: filters.warehouseId,
          orderDate: {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(filters.to) : undefined,
          },
          expectedDeliveryDate: filters.overdue ? { lt: new Date() } : undefined,
        },
        include: { lines: true, supplier: true, warehouse: true, shipment: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  async get(id: string) {
    const { tenantId } = this.tenantContext.get();
    const po = await withTenant(tenantId, (tx) =>
      tx.purchaseOrder.findFirst({
        where: { id, tenantId },
        include: {
          lines: { include: { product: true } },
          supplier: true,
          warehouse: true,
          shipment: true,
          goodsReceipts: { include: { lines: true }, orderBy: { receivedAt: "desc" } },
        },
      }),
    );
    if (!po) throw new NotFoundAppException("Purchase order not found");

    const lines = po.lines.map((line) => ({
      ...line,
      remaining: line.qtyOrdered - line.qtyReceived,
      lineTotal: line.qtyOrdered * Number(line.unitCost),
    }));

    return {
      ...po,
      lines,
      totalValue: lines.reduce((sum, l) => sum + l.lineTotal, 0),
      receivedValue: lines.reduce((sum, l) => sum + l.qtyReceived * Number(l.unitCost), 0),
    };
  }

  /** Only Admin/Procurement Manager can approve — enforced by @RequirePermissions("po:approve") on the route. */
  async approve(id: string) {
    const { tenantId, userId } = this.tenantContext.get();
    const updated = await withTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, tenantId } });
      if (!po) throw new NotFoundAppException("Purchase order not found");
      assertPoTransition(po.status, PurchaseOrderStatus.APPROVED);

      const result = await tx.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.APPROVED, approvedByUserId: userId, approvedAt: new Date() },
      });
      await this.audit.record(tx, tenantId, {
        userId,
        action: "purchase_order.approve",
        entityType: "PurchaseOrder",
        entityId: id,
        metadata: { poNumber: po.poNumber },
      });
      return result;
    });

    const payload: PoApprovedPayload = {
      tenantId,
      purchaseOrderId: id,
      approvedByUserId: userId,
      approvedAt: updated.approvedAt!.toISOString(),
    };
    await this.events.emitAsync(DomainEvent.PoApproved, payload);
    return updated;
  }

  async cancel(id: string) {
    const { tenantId, userId } = this.tenantContext.get();
    return withTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, tenantId } });
      if (!po) throw new NotFoundAppException("Purchase order not found");
      assertPoTransition(po.status, PurchaseOrderStatus.CANCELLED);

      const result = await tx.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.CANCELLED } });
      await this.audit.record(tx, tenantId, {
        userId,
        action: "purchase_order.cancel",
        entityType: "PurchaseOrder",
        entityId: id,
        metadata: { poNumber: po.poNumber, fromStatus: po.status },
      });
      return result;
    });
  }

  /**
   * Records one receiving action (a GoodsReceipt) against a PO, moves it
   * to PARTIALLY_RECEIVED or RECEIVED, and emits `po.received` so
   * Inventory can post the ledger movement — Procurement never writes
   * StockLevel/StockMovement itself (manifest §2). Rejects (never clamps)
   * any line that would push received quantity past ordered quantity.
   */
  async receive(purchaseOrderId: string, dto: ReceivePurchaseOrderDto) {
    const { tenantId, userId } = this.tenantContext.get();

    const result = await withTenant(tenantId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: purchaseOrderId, tenantId }, include: { lines: true } });
      if (!po) throw new NotFoundAppException("Purchase order not found");
      if (!RECEIVABLE_STATUSES.includes(po.status)) {
        throw new BadRequestAppException(
          AppErrorCode.PURCHASE_ORDER_INVALID_STATUS,
          `Purchase order cannot be received from ${po.status} state`,
        );
      }

      for (const receipt of dto.lines) {
        const line = po.lines.find((l) => l.id === receipt.purchaseOrderLineId);
        if (!line) {
          throw new BadRequestAppException(
            AppErrorCode.PURCHASE_ORDER_LINE_UNKNOWN,
            `Unknown PO line ${receipt.purchaseOrderLineId}`,
          );
        }
        if (line.qtyReceived + receipt.qtyReceived > line.qtyOrdered) {
          throw new BadRequestAppException(
            AppErrorCode.PURCHASE_ORDER_OVER_RECEIPT,
            `Receiving ${receipt.qtyReceived} on line ${line.id} would exceed the ordered quantity ` +
              `(${line.qtyReceived}/${line.qtyOrdered} already received)`,
          );
        }
      }

      const goodsReceipt = await tx.goodsReceipt.create({
        data: { tenantId, purchaseOrderId, warehouseId: po.warehouseId, receivedByUserId: userId },
      });

      const eventLines: PoReceivedPayload["lines"] = [];
      for (const receipt of dto.lines) {
        const line = po.lines.find((l) => l.id === receipt.purchaseOrderLineId)!;
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { qtyReceived: { increment: receipt.qtyReceived } },
        });
        const receiptLine = await tx.goodsReceiptLine.create({
          data: {
            tenantId,
            goodsReceiptId: goodsReceipt.id,
            purchaseOrderLineId: line.id,
            productId: line.productId,
            qtyReceived: receipt.qtyReceived,
          },
        });
        eventLines.push({
          purchaseOrderLineId: line.id,
          goodsReceiptLineId: receiptLine.id,
          productId: line.productId,
          qtyReceived: receipt.qtyReceived,
        });
      }

      const refreshedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } });
      const fullyReceived = refreshedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
      const status = fullyReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;

      await tx.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status } });

      return { warehouseId: po.warehouseId, goodsReceiptId: goodsReceipt.id, eventLines };
    });

    const payload: PoReceivedPayload = {
      eventId: randomUUID(),
      tenantId,
      purchaseOrderId,
      warehouseId: result.warehouseId,
      receiptId: result.goodsReceiptId,
      receivedAt: new Date().toISOString(),
      lines: result.eventLines,
    };
    await this.events.emitAsync(DomainEvent.PoReceived, payload);

    return this.get(purchaseOrderId);
  }

  /**
   * Logistics owns Shipment, not PurchaseOrder — this reacts to the event
   * it emits on shipment creation instead of Logistics writing to
   * purchase_orders directly (manifest §1 module-boundary rule).
   * Idempotent like every other cross-module handler; a PO that isn't in
   * APPROVED any more (already SHIPPED, or cancelled) is left alone
   * rather than erroring, since redelivery of an old event shouldn't
   * fail loudly for a PO that's since moved on.
   */
  @OnEvent(DomainEvent.ShipmentCreated)
  async handleShipmentCreated(payload: ShipmentCreatedPayload) {
    if (!payload.purchaseOrderId) return;

    await withTenant(payload.tenantId, async (tx) => {
      const claimed = await claimEvent(tx, payload.tenantId, payload.eventId, DomainEvent.ShipmentCreated);
      if (!claimed) {
        this.logger.debug(`shipment.created ${payload.eventId} already processed — skipping`);
        return;
      }

      const po = await tx.purchaseOrder.findFirst({ where: { id: payload.purchaseOrderId!, tenantId: payload.tenantId } });
      if (!po || po.status !== PurchaseOrderStatus.APPROVED) return;

      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: PurchaseOrderStatus.SHIPPED } });
    });
  }
}
