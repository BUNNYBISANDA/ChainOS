import { Module } from "@nestjs/common";
import { ShipmentsController } from "./shipments.controller";
import { ShipmentsService } from "./shipments.service";

/**
 * Owns: shipments, carriers, tracking events (manifest §2). Handles both
 * legs: INBOUND ties to a PurchaseOrder + origin supplier, OUTBOUND ties
 * to a SalesOrder + destination customer (phase 2). Publishes
 * shipment.created, shipment.dispatched, shipment.delivered.
 */
@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class LogisticsModule {}
