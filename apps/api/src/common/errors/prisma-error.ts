import { Prisma } from "@chainos/database";
import { DuplicateValueAppException } from "./app-exception";

/**
 * Wraps a create/update call and turns a unique-constraint violation
 * (P2002 — a duplicate SKU, supplier code, warehouse code, PO/shipment
 * number, ...) into a stable `DUPLICATE_VALUE` API error instead of an
 * opaque 500. Anything else rethrows untouched.
 */
export async function withDuplicateCheck<T>(message: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateValueAppException(message, { fields: err.meta?.target });
    }
    throw err;
  }
}
