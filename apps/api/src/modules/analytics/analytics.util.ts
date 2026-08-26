import type { Prisma } from "@chainos/database";

/**
 * Pure helpers shared by every analytics service. Kept dependency-free
 * (no Prisma/Nest imports beyond the Decimal type) so they're unit-testable
 * without mocking a transaction — see analytics.util.spec.ts. DB-level
 * correctness of the queries that feed these helpers is covered instead by
 * apps/api/test/integration/analytics.integration-spec.ts against the
 * golden seed fixtures (see docs/analytics/kpi-definitions.md).
 */

export type DateRangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export interface ResolvedDateRange {
  from: Date;
  to: Date;
  preset: DateRangePreset;
}

/**
 * Resolves the Control Tower's date-range filter. `from`/`to` (ISO date
 * strings) always win when both are present, regardless of `range` —
 * that's what makes `range=custom` work without a separate code path.
 * Falls back to the last 30 days when nothing is supplied.
 */
export function resolveDateRange(
  params: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): ResolvedDateRange {
  if (params.from && params.to) {
    const from = new Date(params.from);
    const to = new Date(params.to);
    return { from: startOfDay(from), to: endOfDay(to), preset: "custom" };
  }

  const preset: DateRangePreset = isPreset(params.range) ? params.range : "30d";
  if (preset === "today") {
    return { from: startOfDay(now), to: now, preset };
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: startOfDay(from), to: now, preset };
}

function isPreset(value: string | undefined): value is DateRangePreset {
  return value === "today" || value === "7d" || value === "30d" || value === "90d";
}

// UTC throughout (spec §47) — mixing a UTC-parsed date-only string (e.g.
// "2026-01-01" -> midnight UTC) with local-time setHours()/getDay() would
// shift the result by the server's UTC offset.
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** `null` on a zero/undefined denominator — callers must render "N/A", never "0%" or NaN. */
export function safePercent(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return round2((numerator / denominator) * 100);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "object" ? Number(value.toString()) : Number(value);
}

export type TrendBucket = "day" | "week" | "month";

/** Daily buckets for ranges up to ~31 days, weekly up to ~180, monthly beyond — keeps trend charts to a readable point count (spec §11). */
export function resolveTrendBucket(from: Date, to: Date): TrendBucket {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

/** Stable, sortable bucket key for grouping a timestamp into a trend point. */
export function trendBucketKey(date: Date, bucket: TrendBucket): string {
  if (bucket === "day") return date.toISOString().slice(0, 10);
  if (bucket === "month") return date.toISOString().slice(0, 7);
  // Week: ISO week start (Monday), formatted as that Monday's date. UTC
  // throughout, same reasoning as startOfDay/endOfDay above.
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export type InventoryRiskLevel = "STOCKOUT" | "PROJECTED_STOCKOUT" | "HEALTHY";

/**
 * Deterministic inventory-risk classification — see
 * docs/adr/0011-inventory-risk-model.md. No forecasting, no invented
 * thresholds: `available <= 0` is always STOCKOUT regardless of incoming
 * supply; otherwise a negative projection is PROJECTED_STOCKOUT.
 */
export function classifyInventoryRisk(available: number, projected: number): InventoryRiskLevel {
  if (available <= 0) return "STOCKOUT";
  if (projected < 0) return "PROJECTED_STOCKOUT";
  return "HEALTHY";
}

/**
 * Customer OTIF success predicate — see docs/adr/0010-otif-definition.md.
 * Callers are responsible for eligibility (linked shipment DELIVERED +
 * requestedDeliveryDate present) before calling this; it only judges
 * on-time-in-full given that an order is eligible.
 */
export function isOtifSuccess(input: { fullyFulfilled: boolean; deliveredAt: Date; requestedDeliveryDate: Date }): boolean {
  return input.fullyFulfilled && input.deliveredAt.getTime() <= input.requestedDeliveryDate.getTime();
}
