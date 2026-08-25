import { Module } from "@nestjs/common";
import { StockLevelsController } from "./stock-levels.controller";
import { StockMovementsController } from "./stock-movements.controller";
import { InventoryService } from "./inventory.service";
import { WarehousesController } from "./warehouses.controller";
import { WarehousesService } from "./warehouses.service";

/**
 * Owns: warehouses, locations, stock levels, stock movements, inventory
 * reservations (manifest §2). Publishes stock.changed, stock.low.
 * Subscribes to po.received, sales-order.fulfilled — see InventoryService.
 * Exports InventoryService so FulfillmentModule can call
 * reserveForSalesOrder()/releaseReservationsForSalesOrder() directly (see
 * docs/adr/0006-reservation-concurrency-strategy.md).
 */
@Module({
  controllers: [StockLevelsController, StockMovementsController, WarehousesController],
  providers: [InventoryService, WarehousesService],
  exports: [InventoryService],
})
export class InventoryModule {}
