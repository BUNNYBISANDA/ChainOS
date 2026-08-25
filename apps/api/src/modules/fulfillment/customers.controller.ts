import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @RequirePermissions("customer:write")
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get()
  list() {
    return this.customers.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.customers.get(id);
  }

  @Patch(":id")
  @RequirePermissions("customer:write")
  update(@Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }
}
