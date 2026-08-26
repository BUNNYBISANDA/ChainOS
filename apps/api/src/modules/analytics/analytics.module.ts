import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { ControlTowerService } from "./control-tower.service";
import { ProcurementAnalyticsService } from "./procurement-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { FulfillmentAnalyticsService } from "./fulfillment-analytics.service";
import { LogisticsAnalyticsService } from "./logistics-analytics.service";
import { SupplierAnalyticsService } from "./supplier-analytics.service";
import { ExceptionsService } from "./exceptions.service";

/**
 * Read-only cross-domain analytics layer (spec §5). Reads across
 * Procurement/Inventory/Fulfillment/Logistics tables via Prisma directly —
 * no module here ever calls `.create`/`.update`/`.delete` on a
 * domain-owned table. See docs/adr/0009-analytics-read-model.md.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [
    ControlTowerService,
    ProcurementAnalyticsService,
    InventoryAnalyticsService,
    FulfillmentAnalyticsService,
    LogisticsAnalyticsService,
    SupplierAnalyticsService,
    ExceptionsService,
  ],
})
export class AnalyticsModule {}
