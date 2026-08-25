import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { prisma, withTenant } from "@chainos/database";
import { AppErrorCode } from "../../../common/errors/app-error-code";
import { AppException } from "../../../common/errors/app-exception";
import {
  ACCESS_TOKEN_TTL,
  AccessTokenPayload,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_MS,
  RefreshTokenPayload,
  getAccessTokenSecret,
  getRefreshTokenSecret,
} from "../../../common/auth/jwt-payload";
import { LoginDto } from "./dto/login.dto";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
    tenantSlug: string;
    roleName: string;
    permissions: string[];
  };
}

type UserWithRole = { id: string; email: string; name: string; role: { name: string; permissions: string[] } };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const INVALID_CREDENTIALS = () =>
  new AppException(HttpStatus.UNAUTHORIZED, AppErrorCode.INVALID_CREDENTIALS, "Invalid email or password");

const INVALID_REFRESH_TOKEN = () =>
  new AppException(HttpStatus.UNAUTHORIZED, AppErrorCode.REFRESH_TOKEN_INVALID, "Invalid or expired refresh token");

/**
 * Owns the "Authenticated User -> Organization Membership -> Active
 * Organization -> RBAC" steps of the request flow described in docs/adr —
 * everything downstream of this (Tenant Context -> Database -> Postgres
 * RLS) is unchanged. See AuthMiddleware for how the issued access token
 * turns back into a TenantContext on every subsequent request.
 */
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(dto: LoginDto): Promise<AuthTokens> {
    const tenant = await prisma.tenant.findUnique({ where: { slug: dto.organizationSlug } });
    if (!tenant) {
      throw new AppException(HttpStatus.UNAUTHORIZED, AppErrorCode.ORGANIZATION_NOT_FOUND, "Unknown organization");
    }

    const user = await withTenant(tenant.id, (tx) =>
      tx.user.findFirst({ where: { email: dto.email }, include: { role: true } }),
    );
    if (!user) throw INVALID_CREDENTIALS();

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw INVALID_CREDENTIALS();

    return this.issueTokens(tenant.id, tenant.slug, user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const user = await withTenant(payload.tenantId, async (tx) => {
      const stored = await tx.refreshToken.findFirst({
        where: { tokenHash, userId: payload.sub, tenantId: payload.tenantId },
      });
      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        return null;
      }
      // Rotate: consume this refresh token so it can't be replayed even
      // though its JWT signature is still valid until natural expiry.
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      return tx.user.findFirst({
        where: { id: payload.sub, tenantId: payload.tenantId },
        include: { role: true },
      });
    });

    if (!user) throw INVALID_REFRESH_TOKEN();

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: payload.tenantId } });
    return this.issueTokens(tenant.id, tenant.slug, user);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.verifyRefreshToken(refreshToken);
    } catch {
      return; // already invalid/expired — nothing to revoke
    }
    const tokenHash = hashToken(refreshToken);
    await withTenant(payload.tenantId, (tx) =>
      tx.refreshToken.updateMany({
        where: { tokenHash, userId: payload.sub, tenantId: payload.tenantId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  private verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      return this.jwt.verify<RefreshTokenPayload>(refreshToken, { secret: getRefreshTokenSecret() });
    } catch {
      throw INVALID_REFRESH_TOKEN();
    }
  }

  private async issueTokens(tenantId: string, tenantSlug: string, user: UserWithRole): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = { sub: user.id, tenantId, permissions: user.role.permissions };
    const accessToken = this.jwt.sign(accessPayload, { secret: getAccessTokenSecret(), expiresIn: ACCESS_TOKEN_TTL });

    const refreshPayload: RefreshTokenPayload = { sub: user.id, tenantId, jti: randomUUID() };
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: getRefreshTokenSecret(),
      expiresIn: REFRESH_TOKEN_TTL,
    });

    await withTenant(tenantId, (tx) =>
      tx.refreshToken.create({
        data: {
          tenantId,
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      }),
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId,
        tenantSlug,
        roleName: user.role.name,
        permissions: user.role.permissions,
      },
    };
  }
}
