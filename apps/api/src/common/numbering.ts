import { withTenant } from "@chainos/database";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Tenant-scoped, human-readable sequential numbers: `PO-2026-000001`,
 * `SHP-2026-000001`. The counter lives in `NumberSequence` keyed by
 * `${prefix}-${year}`, so it resets per prefix+year automatically without
 * a schema change. Must be called inside the same transaction as the
 * insert that uses the number — the UPSERT's row lock is what makes two
 * concurrent callers get different numbers instead of racing.
 */
export async function nextDocumentNumber(tx: Tx, tenantId: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;

  const seq = await tx.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value: { increment: 1 } },
    create: { tenantId, key, value: 1 },
  });

  return `${key}-${String(seq.value).padStart(6, "0")}`;
}
