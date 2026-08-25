import { IsDateString, IsEnum, IsLatitude, IsLongitude, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { ShipmentEventType } from "@chainos/database";

export class CreateShipmentEventDto {
  @IsEnum(ShipmentEventType)
  eventType!: ShipmentEventType;

  @IsOptional()
  @IsDateString()
  eventTimestamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationName?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: string;

  @IsOptional()
  @IsLongitude()
  longitude?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
