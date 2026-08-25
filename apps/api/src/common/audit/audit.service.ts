import { Injectable } from "@nestjs/common";
import { Prisma, withTenant } from "@chainos/database";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

export interface AuditEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only "who did what, when" trail for sensitive actions (PO
 * approval, status transitions, ...) — a durable record beyond a single
 * `approvedBy`/`approvedAt` column pair. Write inside the same
 * transaction as the action it records, via `record()`, so the audit
 * entry and the state change commit or roll back together.
 */
@Injectable()
export class AuditService {
  record(tx: Tx, tenantId: string, entry: AuditEntry) {
    return tx.auditLog.create({
      data: {
        tenantId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
