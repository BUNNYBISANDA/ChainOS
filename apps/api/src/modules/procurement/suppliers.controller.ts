import { Body, Controller, Get, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { SuppliersService } from "./suppliers.service";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @RequirePermissions("procurement:write")
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Get()
  list() {
    return this.suppliers.list();
  }
}
