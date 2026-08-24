import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ShipmentDirection } from "@chainos/database";

export class CreateShipmentDto {
  @IsEnum(ShipmentDirection)
  direction!: ShipmentDirection;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsUUID()
  customerOrderId?: string;

  @IsOptional()
  @IsUUID()
  originWarehouseId?: string;

  @IsOptional()
  @IsUUID()
  destWarehouseId?: string;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
