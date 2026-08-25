import { Module } from "@nestjs/common";
import { StockLevelsController } from "./stock-levels.controller";
import { StockMovementsController } from "./stock-movements.controller";
import { InventoryService } from "./inventory.service";
import { WarehousesController } from "./warehouses.controller";
import { WarehousesService } from "./warehouses.service";

/**
 * Owns: warehouses, locations, stock levels, stock movements (manifest §2).
 * Publishes stock.changed, stock.low. Subscribes to po.received,
 * order.reserved, order.ready — see InventoryService.
 */
@Module({
  controllers: [StockLevelsController, StockMovementsController, WarehousesController],
  providers: [InventoryService, WarehousesService],
})
export class InventoryModule {}
