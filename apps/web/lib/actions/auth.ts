"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPublic } from "@/lib/api";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  COOKIE_OPTIONS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  USER_COOKIE,
  type SessionUser,
} from "@/lib/session";

export interface LoginState {
  error?: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const organizationSlug = String(formData.get("organizationSlug") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!organizationSlug || !email || !password) {
    return { error: "Organization, email, and password are all required." };
  }

  let body: LoginResponse;
  try {
    body = await apiPublic<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ organizationSlug, email, password }),
    });
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "ORGANIZATION_NOT_FOUND") return { error: "No organization found with that identifier." };
      if (code === "INVALID_CREDENTIALS") return { error: "Incorrect email or password." };
    }
    return { error: "Could not sign in — please try again." };
  }

  const jar = await cookies();
  jar.set(ACCESS_TOKEN_COOKIE, body.accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_TOKEN_MAX_AGE });
  jar.set(REFRESH_TOKEN_COOKIE, body.refreshToken, { ...COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });
  jar.set(USER_COOKIE, JSON.stringify(body.user), { ...COOKIE_OPTIONS, maxAge: REFRESH_TOKEN_MAX_AGE });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    await apiPublic("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => {
      // Best-effort revoke — an already-expired/invalid token is a no-op
      // server-side anyway; the cookies are cleared below regardless.
    });
  }

  jar.delete(ACCESS_TOKEN_COOKIE);
  jar.delete(REFRESH_TOKEN_COOKIE);
  jar.delete(USER_COOKIE);
  redirect("/login");
}
