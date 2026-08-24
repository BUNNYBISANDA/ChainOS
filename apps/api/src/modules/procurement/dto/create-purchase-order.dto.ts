import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsNumber, IsPositive, IsUUID, Min, ValidateNested } from "class-validator";

export class CreatePurchaseOrderLineDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  qtyOrdered!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  warehouseId!: string;

  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  @ArrayMinSize(1)
  lines!: CreatePurchaseOrderLineDto[];
}

export class ReceivePurchaseOrderLineDto {
  @IsUUID()
  purchaseOrderLineId!: string;

  @IsInt()
  @IsPositive()
  qtyReceived!: number;
}

export class ReceivePurchaseOrderDto {
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  @ArrayMinSize(1)
  lines!: ReceivePurchaseOrderLineDto[];
}
