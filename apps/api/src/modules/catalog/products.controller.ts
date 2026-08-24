import { Body, Controller, Get, Post } from "@nestjs/common";
import { RequirePermissions } from "../../common/guards/permissions.decorator";
import { CreateProductDto } from "./dto/create-product.dto";
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
  list() {
    return this.products.list();
  }
}
