import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { CustomerStatus } from "@chainos/database";

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
