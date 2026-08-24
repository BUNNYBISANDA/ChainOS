import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateCustomerOrderDto } from "./dto/create-customer-order.dto";
import { CustomerOrdersService } from "./customer-orders.service";

@Controller("customer-orders")
export class CustomerOrdersController {
  constructor(private readonly customerOrders: CustomerOrdersService) {}

  @Post()
  @RequirePermissions("order:create")
  create(@Body() dto: CreateCustomerOrderDto) {
    return this.customerOrders.create(dto);
  }

  @Get()
  list() {
    return this.customerOrders.list();
  }

  @Post(":id/reserve")
  @RequirePermissions("order:reserve")
  reserve(@Param("id") id: string) {
    return this.customerOrders.reserve(id);
  }

  @Post(":id/ready")
  @RequirePermissions("order:ready")
  ready(@Param("id") id: string) {
    return this.customerOrders.ready(id);
  }
}
