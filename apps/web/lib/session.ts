export interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  permissions: string[];
  exp: number;
  iat: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantSlug: string;
  roleName: string;
  permissions: string[];
}

/**
 * Decodes a JWT payload without verifying the signature — only used
 * client/middleware-side to make a UX decision (is this token about to
 * expire, should we proactively refresh). The actual security boundary
 * is the API's own signature verification (see AuthMiddleware in
 * apps/api) — this never needs to be trusted, only convenient.
 */
export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const USER_COOKIE = "chainos_user";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const ACCESS_TOKEN_MAX_AGE = 15 * 60;
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;
