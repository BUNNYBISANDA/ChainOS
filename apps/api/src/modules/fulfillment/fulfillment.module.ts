import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { SalesOrdersController } from "./sales-orders.controller";
import { SalesOrdersService } from "./sales-orders.service";

/**
 * Owns: customers, sales orders, sales order lines (manifest, phase 2
 * outbound slice). Publishes sales-order.allocated, sales-order.fulfilled.
 * Imports InventoryModule to call reserveForSalesOrder()/
 * releaseReservationsForSalesOrder() directly, in the same transaction —
 * see docs/adr/0006-reservation-concurrency-strategy.md.
 */
@Module({
  imports: [InventoryModule],
  controllers: [CustomersController, SalesOrdersController],
  providers: [CustomersService, SalesOrdersService],
})
export class FulfillmentModule {}
