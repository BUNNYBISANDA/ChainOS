import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @RequirePermissions("catalog:write")
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get()
  list(@Query("active") active?: string) {
    return this.products.list({ active: active === undefined ? undefined : active === "true" });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.products.get(id);
  }

  @Patch(":id")
  @RequirePermissions("catalog:write")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }
}
