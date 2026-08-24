import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

/** Owns: products, categories, UOM, supplier-product links (manifest §2). */
@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class CatalogModule {}
