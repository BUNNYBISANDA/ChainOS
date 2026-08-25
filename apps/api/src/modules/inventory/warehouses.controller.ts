import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { UpdateWarehouseDto } from "./dto/update-warehouse.dto";
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

  @Get(":id")
  get(@Param("id") id: string) {
    return this.warehouses.get(id);
  }

  @Patch(":id")
  @RequirePermissions("inventory:write")
  update(@Param("id") id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(id, dto);
  }
}
