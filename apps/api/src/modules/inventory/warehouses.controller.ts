import { Body, Controller, Get, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Post()
  @RequirePermissions("inventory:write")
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Get()
  list() {
    return this.warehouses.list();
  }
}
