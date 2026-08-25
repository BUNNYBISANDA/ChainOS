import { Controller, Get, Query } from "@nestjs/common";
import { TenantContext } from "../../common/tenant/tenant-context";
import { InventoryService } from "./inventory.service";

/** Read-only, immutable ledger view — see StockMovement in schema.prisma. */
@Controller("stock-movements")
export class StockMovementsController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  list(@Query("productId") productId?: string, @Query("warehouseId") warehouseId?: string) {
    const { tenantId } = this.tenantContext.get();
    return this.inventory.listMovements(tenantId, { productId, warehouseId });
  }
}
