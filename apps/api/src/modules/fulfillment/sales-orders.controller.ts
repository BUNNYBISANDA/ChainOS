import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SalesOrderStatus } from "@chainos/database";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateSalesOrderDto } from "./dto/create-sales-order.dto";
import { FulfillSalesOrderDto } from "./dto/fulfill-sales-order.dto";
import { SalesOrdersService } from "./sales-orders.service";

@Controller("sales-orders")
export class SalesOrdersController {
  constructor(private readonly salesOrders: SalesOrdersService) {}

  @Post()
  @RequirePermissions("sales-order:create")
  create(@Body() dto: CreateSalesOrderDto) {
    return this.salesOrders.create(dto);
  }

  @Get()
  list(
    @Query("status") status?: SalesOrderStatus,
    @Query("customerId") customerId?: string,
    @Query("warehouseId") warehouseId?: string,
    @Query("overdue") overdue?: string,
  ) {
    return this.salesOrders.list({ status, customerId, warehouseId, overdue: overdue === "true" ? true : undefined });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.salesOrders.get(id);
  }

  @Post(":id/confirm")
  @RequirePermissions("sales-order:confirm")
  confirm(@Param("id") id: string) {
    return this.salesOrders.confirm(id);
  }

  @Post(":id/allocate")
  @RequirePermissions("sales-order:allocate")
  allocate(@Param("id") id: string) {
    return this.salesOrders.allocate(id);
  }

  @Post(":id/cancel")
  @RequirePermissions("sales-order:cancel")
  cancel(@Param("id") id: string) {
    return this.salesOrders.cancel(id);
  }

  @Post(":id/fulfill")
  @RequirePermissions("sales-order:fulfill")
  fulfill(@Param("id") id: string, @Body() dto: FulfillSalesOrderDto) {
    return this.salesOrders.fulfill(id, dto);
  }
}
