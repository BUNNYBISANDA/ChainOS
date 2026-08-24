import { Body, Controller, Get, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @RequirePermissions("fulfillment:write")
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get()
  list() {
    return this.customers.list();
  }
}
