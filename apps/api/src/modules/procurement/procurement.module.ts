import { Module } from "@nestjs/common";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";

/** Owns: suppliers, purchase orders, PO lines (manifest §2). Publishes po.issued, po.received. */
@Module({
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [SuppliersService, PurchaseOrdersService],
})
export class ProcurementModule {}
