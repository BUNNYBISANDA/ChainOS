import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateSalesOrderLineDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @IsPositive()
  qtyOrdered!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateSalesOrderDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  requestedDeliveryDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderLineDto)
  @ArrayMinSize(1)
  lines!: CreateSalesOrderLineDto[];
}
