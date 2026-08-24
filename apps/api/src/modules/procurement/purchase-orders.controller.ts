import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
  list() {
    return this.purchaseOrders.list();
  }

  @Post(":id/receive")
  @RequirePermissions("po:receive")
  receive(@Param("id") id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.purchaseOrders.receive(id, dto);
  }
}
