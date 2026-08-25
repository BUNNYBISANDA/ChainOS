import "server-only";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** Mirrors AllExceptionsFilter's response shape (apps/api/src/common/errors). */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthenticatedError extends ApiError {
  constructor() {
    super(401, "UNAUTHENTICATED", "Not signed in");
    this.name = "UnauthenticatedError";
  }
}

async function rawRequest<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.code ?? "UNKNOWN", body?.message ?? res.statusText, body?.details, body?.requestId);
  }
  return body as T;
}

/** For the pre-login /auth/* calls — no access token exists yet. */
export function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  return rawRequest<T>(path, init);
}

async function withAuth<T>(path: string, init: RequestInit): Promise<T> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) throw new UnauthenticatedError();
  return rawRequest<T>(path, init, token);
}

export function apiGet<T>(path: string): Promise<T> {
  return withAuth<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return withAuth<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  return withAuth<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined });
}
