import { ApiError } from "@/lib/api";

export interface FormState {
  error?: string;
}

/** Turns an ApiError's stable `code` into user-facing copy; falls back to the API's own message. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
