import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ShipmentDirection } from "@chainos/database";

export class CreateShipmentDto {
  @IsEnum(ShipmentDirection)
  direction!: ShipmentDirection;

  /** Required for INBOUND — destWarehouseId is derived from the PO server-side, not supplied by the client. */
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  /** Required for OUTBOUND — originWarehouseId/destCustomerId are derived from the SalesOrder server-side, not supplied by the client. */
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}
