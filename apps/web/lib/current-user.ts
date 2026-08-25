import "server-only";
import { cookies } from "next/headers";
import { USER_COOKIE, type SessionUser } from "./session";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
