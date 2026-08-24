import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CustomerOrdersController } from "./customer-orders.controller";
import { CustomerOrdersService } from "./customer-orders.service";

/**
 * Owns: customer orders, order lines, reservations (manifest §2).
 * Publishes order.reserved, order.ready. Subscribes to stock.changed,
 * shipment.delivered — see CustomerOrdersService.
 */
@Module({
  controllers: [CustomersController, CustomerOrdersController],
  providers: [CustomersService, CustomerOrdersService],
})
export class FulfillmentModule {}
