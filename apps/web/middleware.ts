import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  USER_COOKIE,
  decodeJwtPayload,
  type AccessTokenClaims,
} from "@/lib/session";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const PUBLIC_PATHS = ["/login"];

/**
 * Route guard + proactive refresh. This is a UX convenience, not the
 * security boundary — the API's own AuthMiddleware verifies the token
 * signature on every request regardless of what happens here (see
 * docs/architecture/authentication.md). Refreshing here just means a
 * page load doesn't fail with a stale token that was about to expire
 * anyway.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const claims = accessToken ? decodeJwtPayload<AccessTokenClaims>(accessToken) : null;
  const expiringSoon = !claims || claims.exp * 1000 < Date.now() + 60_000;

  const response = NextResponse.next();

  if (expiringSoon && refreshToken) {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
      if (res.ok) {
        const body = await res.json();
        response.cookies.set(ACCESS_TOKEN_COOKIE, body.accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });
        response.cookies.set(REFRESH_TOKEN_COOKIE, body.refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
        response.cookies.set(USER_COOKIE, JSON.stringify(body.user), { ...COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
        accessToken = body.accessToken;
      } else {
        accessToken = undefined;
      }
    } catch {
      accessToken = undefined;
    }
  }

  if (!accessToken) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
