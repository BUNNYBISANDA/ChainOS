import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateShipmentEtaDto {
  @IsDateString()
  estimatedArrivalAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
