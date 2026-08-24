import { Module } from "@nestjs/common";
import { ShipmentsController } from "./shipments.controller";
import { ShipmentsService } from "./shipments.service";

/**
 * Owns: shipments, carriers, tracking events (manifest §2).
 * Publishes shipment.dispatched, shipment.delivered. Subscribes to
 * order.ready (po.issued subscription is a phase-1 follow-up once inbound
 * shipment tracking is built out).
 */
@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class LogisticsModule {}
