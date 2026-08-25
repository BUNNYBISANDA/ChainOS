/** Claims embedded in the short-lived access token (see AuthService.issueTokens). */
export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
  permissions: string[];
}

/** Claims embedded in the long-lived, single-use refresh token. */
export interface RefreshTokenPayload {
  sub: string; // userId
  tenantId: string;
  jti: string; // matches RefreshToken.tokenHash (hashed) — see AuthService
}

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getAccessTokenSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return secret;
}

export function getRefreshTokenSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not set");
  }
  return secret;
}
