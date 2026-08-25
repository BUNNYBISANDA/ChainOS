import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsPositive, IsUUID, ValidateNested } from "class-validator";

export class FulfillSalesOrderLineDto {
  @IsUUID()
  salesOrderLineId!: string;

  @IsInt()
  @IsPositive()
  qty!: number;
}

export class FulfillSalesOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FulfillSalesOrderLineDto)
  @ArrayMinSize(1)
  lines!: FulfillSalesOrderLineDto[];
}
