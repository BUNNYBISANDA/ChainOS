import { Module } from "@nestjs/common";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";

/**
 * Owns: suppliers, purchase orders, PO lines, goods receipts (manifest §2).
 * Publishes po.approved, po.received. Subscribes to shipment.created (to
 * move an APPROVED PO to SHIPPED without Logistics writing to this
 * module's tables directly).
 */
@Module({
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [SuppliersService, PurchaseOrdersService],
})
export class ProcurementModule {}
