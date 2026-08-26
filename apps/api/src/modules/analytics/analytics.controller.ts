import { Controller, Get, Param, Query } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { parseAnalyticsFilters, parsePage, type AnalyticsQuery, type PageQuery } from "./analytics-filters";
import { ControlTowerService } from "./control-tower.service";
import { ProcurementAnalyticsService } from "./procurement-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { FulfillmentAnalyticsService } from "./fulfillment-analytics.service";
import { LogisticsAnalyticsService } from "./logistics-analytics.service";
import { SupplierAnalyticsService, type SupplierSortKey } from "./supplier-analytics.service";
import { ExceptionsService, type ExceptionDomain, type ExceptionSeverity } from "./exceptions.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly controlTower: ControlTowerService,
    private readonly procurement: ProcurementAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly fulfillment: FulfillmentAnalyticsService,
    private readonly logistics: LogisticsAnalyticsService,
    private readonly suppliers: SupplierAnalyticsService,
    private readonly exceptions: ExceptionsService,
  ) {}

  @Get("control-tower")
  @RequirePermissions("analytics:control-tower:read")
  controlTowerSummary(@Query() query: AnalyticsQuery) {
    return this.controlTower.summary(parseAnalyticsFilters(query));
  }

  @Get("procurement")
  @RequirePermissions("analytics:procurement:read")
  procurementSummary(@Query() query: AnalyticsQuery) {
    return this.procurement.summary(parseAnalyticsFilters(query));
  }

  @Get("procurement/po-value-trend")
  @RequirePermissions("analytics:procurement:read")
  procurementValueTrend(@Query() query: AnalyticsQuery) {
    return this.procurement.valueTrend(parseAnalyticsFilters(query));
  }

  @Get("inventory")
  @RequirePermissions("analytics:inventory:read")
  inventorySummary(@Query() query: AnalyticsQuery) {
    return this.inventory.summary(parseAnalyticsFilters(query));
  }

  @Get("inventory/risk")
  @RequirePermissions("analytics:inventory:read")
  inventoryRisk(
    @Query() query: AnalyticsQuery & PageQuery,
    @Query("risk") risk?: "STOCKOUT" | "PROJECTED_STOCKOUT" | "HEALTHY",
    @Query("productId") productId?: string,
  ) {
    return this.inventory.riskList(parseAnalyticsFilters(query), parsePage(query), risk, productId);
  }

  @Get("inventory/movement-trend")
  @RequirePermissions("analytics:inventory:read")
  inventoryMovementTrend(@Query() query: AnalyticsQuery) {
    return this.inventory.movementTrend(parseAnalyticsFilters(query));
  }

  @Get("fulfillment")
  @RequirePermissions("analytics:fulfillment:read")
  fulfillmentSummary(@Query() query: AnalyticsQuery) {
    return this.fulfillment.summary(parseAnalyticsFilters(query));
  }

  @Get("fulfillment/otif-trend")
  @RequirePermissions("analytics:fulfillment:read")
  otifTrend(@Query() query: AnalyticsQuery) {
    return this.fulfillment.otifTrend(parseAnalyticsFilters(query));
  }

  @Get("logistics")
  @RequirePermissions("analytics:logistics:read")
  logisticsSummary(@Query() query: AnalyticsQuery) {
    return this.logistics.summary(parseAnalyticsFilters(query));
  }

  @Get("suppliers")
  @RequirePermissions("analytics:suppliers:read")
  supplierPerformance(@Query() query: AnalyticsQuery & PageQuery, @Query("sort") sort?: SupplierSortKey, @Query("search") search?: string) {
    return this.suppliers.list(parseAnalyticsFilters(query), parsePage(query), sort, search);
  }

  @Get("suppliers/:id")
  @RequirePermissions("analytics:suppliers:read")
  supplierPerformanceDetail(@Param("id") id: string, @Query() query: AnalyticsQuery) {
    return this.suppliers.get(id, parseAnalyticsFilters(query));
  }

  @Get("exceptions")
  @RequirePermissions("exceptions:read")
  exceptionCenter(
    @Query() query: AnalyticsQuery & PageQuery,
    @Query("domain") domain?: ExceptionDomain,
    @Query("severity") severity?: ExceptionSeverity,
  ) {
    return this.exceptions.list(parseAnalyticsFilters(query), parsePage(query), domain, severity);
  }
}
