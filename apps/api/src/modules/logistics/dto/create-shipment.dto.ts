import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ShipmentDirection } from "@chainos/database";

export class CreateShipmentDto {
  @IsEnum(ShipmentDirection)
  direction!: ShipmentDirection;

  /** Required for INBOUND — destWarehouseId is derived from the PO server-side, not supplied by the client. */
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  /** Required for OUTBOUND. */
  @IsOptional()
  @IsUUID()
  customerOrderId?: string;

  /** OUTBOUND only — the warehouse stock ships from. Ignored for INBOUND (derived from the PO). */
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
