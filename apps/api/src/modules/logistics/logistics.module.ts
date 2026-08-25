import { Module } from "@nestjs/common";
import { ShipmentsController } from "./shipments.controller";
import { ShipmentsService } from "./shipments.service";

/**
 * Owns: shipments, carriers, tracking events (manifest §2).
 * Publishes shipment.created, shipment.dispatched, shipment.delivered.
 * Subscribes to order.ready.
 */
@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class LogisticsModule {}
