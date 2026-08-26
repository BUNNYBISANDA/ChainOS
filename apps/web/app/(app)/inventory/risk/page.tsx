import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { InventoryRiskRow, Paginated, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Label } from "@/components/ui/label";
import { riskLevelTone, formatStatusLabel } from "@/lib/status";
import { formatNumber } from "@/lib/format";

const RISK_LEVELS = ["STOCKOUT", "PROJECTED_STOCKOUT", "HEALTHY"] as const;
const PAGE_SIZE = 25;

export default async function InventoryRiskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const query = new URLSearchParams();
  if (params.warehouseId) query.set("warehouseId", params.warehouseId);
  if (params.risk) query.set("risk", params.risk);
  if (params.productId) query.set("productId", params.productId);
  query.set("range", "90d");
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  let result: Paginated<InventoryRiskRow>;
  let warehouses: Warehouse[];
  try {
    [result, warehouses] = await Promise.all([
      apiGet<Paginated<InventoryRiskRow>>(`/analytics/inventory/risk?${query.toString()}`),
      apiGet<Warehouse[]>("/warehouses"),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Inventory Risk" />
        <ErrorState message="Could not load inventory risk from the API." />
      </>
    );
  }

  const hasFilters = Boolean(params.warehouseId || params.risk || params.productId);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageQuery = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/inventory/risk?${q.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Inventory Risk"
        description={`${result.total} SKU × warehouse row${result.total === 1 ? "" : "s"} — Available + Incoming − Demand = Projected (see docs/analytics/kpi-definitions.md)`}
      />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-56">
            <Label htmlFor="warehouseId">Warehouse</Label>
            <Select id="warehouseId" name="warehouseId" defaultValue={params.warehouseId ?? ""}>
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-56">
            <Label htmlFor="risk">Risk Level</Label>
            <Select id="risk" name="risk" defaultValue={params.risk ?? ""}>
              <option value="">All levels</option>
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {formatStatusLabel(level)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {hasFilters && (
            <ButtonLink href="/inventory/risk" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={hasFilters ? "No SKUs match these filters" : "No inventory risk data yet"} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Warehouse</Th>
                <Th className="text-right">On Hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
                <Th className="text-right">Incoming</Th>
                <Th className="text-right">Demand</Th>
                <Th className="text-right">Projected</Th>
                <Th>Risk</Th>
              </Tr>
            </Thead>
            <Tbody>
              {result.items.map((row) => (
                <Tr key={`${row.productId}:${row.warehouseId}`}>
                  <Td className="font-mono text-xs text-ink-soft">{row.sku}</Td>
                  <Td>
                    <Link href={`/inventory/ledger?productId=${row.productId}&warehouseId=${row.warehouseId}`} className="font-medium text-accent hover:underline">
                      {row.productName}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{row.warehouseName}</Td>
                  <Td className="text-right">{formatNumber(row.onHand)}</Td>
                  <Td className="text-right">{formatNumber(row.reserved)}</Td>
                  <Td className="text-right">{formatNumber(row.available)}</Td>
                  <Td className="text-right">{formatNumber(row.incoming)}</Td>
                  <Td className="text-right">{formatNumber(row.demand)}</Td>
                  <Td className={`text-right font-medium ${row.projected < 0 ? "text-danger" : "text-ink"}`}>{formatNumber(row.projected)}</Td>
                  <Td>
                    <Badge tone={riskLevelTone(row.riskLevel)}>{formatStatusLabel(row.riskLevel)}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
          <span>
            Page {result.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <ButtonLink href={pageQuery(Math.max(1, page - 1))} variant="secondary" size="sm" aria-disabled={page <= 1}>
              Previous
            </ButtonLink>
            <ButtonLink href={pageQuery(Math.min(totalPages, page + 1))} variant="secondary" size="sm" aria-disabled={page >= totalPages}>
              Next
            </ButtonLink>
          </div>
        </div>
      )}
    </>
  );
}
