import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PurchaseOrderStatus } from "@chainos/database";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions("po:create")
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrders.create(dto);
  }

  @Get()
  list(
    @Query("status") status?: PurchaseOrderStatus,
    @Query("supplierId") supplierId?: string,
    @Query("warehouseId") warehouseId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("overdue") overdue?: string,
  ) {
    return this.purchaseOrders.list({ status, supplierId, warehouseId, from, to, overdue: overdue === "true" ? true : undefined });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.purchaseOrders.get(id);
  }

  @Post(":id/approve")
  @RequirePermissions("po:approve")
  approve(@Param("id") id: string) {
    return this.purchaseOrders.approve(id);
  }

  @Post(":id/cancel")
  @RequirePermissions("po:create")
  cancel(@Param("id") id: string) {
    return this.purchaseOrders.cancel(id);
  }

  @Post(":id/receive")
  @RequirePermissions("po:receive")
  receive(@Param("id") id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.purchaseOrders.receive(id, dto);
  }
}
