/**
 * Explicit "en-US" everywhere — `toLocaleDateString()` with no locale
 * argument uses the server process's OS locale (this dev machine's is
 * Thai, which renders Buddhist-calendar years like "2569"), not the
 * viewer's. Server Components render once on the server, so there's no
 * per-viewer locale to defer to here anyway.
 */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatMoney(currency: string, value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** `null`/`undefined` renders as "N/A" — never "0%" for a metric with no eligible denominator (spec §44). */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  return `${value.toFixed(1)}%`;
}
