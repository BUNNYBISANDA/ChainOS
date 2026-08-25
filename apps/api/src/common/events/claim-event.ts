import { Prisma, withTenant } from "@chainos/database";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Inserts the (tenantId, eventId) claim row used to make a cross-module
 * event handler idempotent (see docs/adr/0002-event-idempotency.md).
 * Returns false — caller must no-op — if it loses the unique-constraint
 * race (the event was already processed); rethrows anything else. Must
 * run inside the same `tx` as the mutation it guards.
 */
export async function claimEvent(tx: Tx, tenantId: string, eventId: string, eventType: string): Promise<boolean> {
  try {
    await tx.processedEvent.create({ data: { tenantId, eventId, eventType } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
}
