import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
