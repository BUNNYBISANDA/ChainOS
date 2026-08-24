import { Type } from "class-transformer";
import { ArrayMinSize, IsInt, IsPositive, IsUUID, ValidateNested } from "class-validator";

export class CreateCustomerOrderLineDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  qtyOrdered!: number;
}

export class CreateCustomerOrderDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  warehouseId!: string;

  @ValidateNested({ each: true })
  @Type(() => CreateCustomerOrderLineDto)
  @ArrayMinSize(1)
  lines!: CreateCustomerOrderLineDto[];
}
