import { Controller, Get, Query } from "@nestjs/common";
import { TenantContext } from "../../common/tenant/tenant-context";
import { InventoryService } from "./inventory.service";

@Controller("stock-levels")
export class StockLevelsController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  list(@Query("warehouseId") warehouseId?: string, @Query("productId") productId?: string) {
    const { tenantId } = this.tenantContext.get();
    return this.inventory.listStockLevels(tenantId, { warehouseId, productId });
  }
}
