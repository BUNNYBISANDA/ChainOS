import Link from "next/link";
import { Building2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Paginated, SupplierPerformanceRow } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Label } from "@/components/ui/label";
import { formatMoney, formatPercent } from "@/lib/format";

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "spend", label: "Total Spend" },
  { value: "poCount", label: "PO Count" },
  { value: "onTime", label: "On-Time %" },
  { value: "otif", label: "OTIF %" },
  { value: "leadTime", label: "Avg Lead Time" },
  { value: "late", label: "Late POs" },
];
const PAGE_SIZE = 25;

export default async function SupplierPerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const query = new URLSearchParams();
  query.set("range", params.range ?? "90d");
  if (params.search) query.set("search", params.search);
  query.set("sort", params.sort ?? "spend");
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  let result: Paginated<SupplierPerformanceRow>;
  try {
    result = await apiGet<Paginated<SupplierPerformanceRow>>(`/analytics/suppliers?${query.toString()}`);
  } catch {
    return (
      <>
        <PageHeader title="Supplier Performance" />
        <ErrorState message="Could not load supplier performance from the API." />
      </>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageQuery = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/analytics/suppliers?${q.toString()}`;
  };

  return (
    <>
      <PageHeader title="Supplier Performance" description={`${result.total} supplier${result.total === 1 ? "" : "s"} · last 90 days`} />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-56">
            <Label htmlFor="search">Search</Label>
            <Input id="search" name="search" placeholder="Supplier name or code" defaultValue={params.search ?? ""} />
          </div>
          <div className="w-48">
            <Label htmlFor="sort">Sort By</Label>
            <Select id="sort" name="sort" defaultValue={params.sort ?? "spend"}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {(params.search || (params.sort && params.sort !== "spend")) && (
            <ButtonLink href="/analytics/suppliers" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <EmptyState icon={Building2} title="No supplier activity in this period" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Supplier</Th>
                <Th className="text-right">Spend</Th>
                <Th className="text-right">POs</Th>
                <Th className="text-right">Open POs</Th>
                <Th className="text-right">Avg Lead Time</Th>
                <Th className="text-right">On-Time</Th>
                <Th className="text-right">OTIF</Th>
                <Th className="text-right">Late POs</Th>
              </Tr>
            </Thead>
            <Tbody>
              {result.items.map((row) => (
                <Tr key={row.supplierId}>
                  <Td>
                    <Link href={`/suppliers/${row.supplierId}`} className="font-medium text-accent hover:underline">
                      {row.supplierName}
                    </Link>
                    <span className="ml-1.5 text-xs text-ink-faint">{row.supplierCode}</span>
                  </Td>
                  <Td className="text-right">{formatMoney("THB", row.totalSpend)}</Td>
                  <Td className="text-right">{row.poCount}</Td>
                  <Td className="text-right">{row.openPoCount}</Td>
                  <Td className="text-right">{row.avgLeadTimeDays === null ? "N/A" : `${row.avgLeadTimeDays.toFixed(1)}d`}</Td>
                  <Td className="text-right">{formatPercent(row.onTimePercent)}</Td>
                  <Td className="text-right">{formatPercent(row.otifPercent)}</Td>
                  <Td className={`text-right ${row.latePoCount > 0 ? "font-medium text-danger" : ""}`}>{row.latePoCount}</Td>
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
