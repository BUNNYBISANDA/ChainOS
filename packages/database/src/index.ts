import { PrismaClient } from "../generated/client";

export * from "../generated/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Runs `fn` inside a transaction scoped to one tenant via Postgres RLS
 * (see prisma/rls.sql). Every repository call in the API must go through
 * this — it's the enforcement point for tenant isolation, not a
 * convenience wrapper.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The transaction client type every `withTenant(...)` callback receives — shared here so callers don't each re-derive it. */
export type Tx = Omit<PrismaClient, "$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;

export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // SET LOCAL can't take a bound parameter, so tenantId is validated as a
  // strict UUID before interpolation — never pass an unvalidated value here.
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx);
  });
}
