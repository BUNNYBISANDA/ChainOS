import { Controller, Get } from "@nestjs/common";
import { TenantContext } from "../../common/tenant/tenant-context";
import { InventoryService } from "./inventory.service";

@Controller("stock-levels")
export class StockLevelsController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  list() {
    const { tenantId } = this.tenantContext.get();
    return this.inventory.listStockLevels(tenantId);
  }
}
