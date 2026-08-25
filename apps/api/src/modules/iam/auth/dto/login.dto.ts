import { IsEmail, IsString, MinLength } from "class-validator";

/**
 * `organizationSlug` resolves the Active Organization step: `email` is
 * only unique per-tenant (see User.@@unique([tenantId, email])), not
 * globally, so the tenant has to be identified up front rather than
 * inferred from the email alone.
 */
export class LoginDto {
  @IsString()
  @MinLength(1)
  organizationSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
