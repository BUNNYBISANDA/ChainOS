import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ExceptionDomain, ExceptionItem, ExceptionSeverity, Paginated } from "@/lib/types";
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
import { severityTone, formatStatusLabel } from "@/lib/status";
import { formatDateTime } from "@/lib/format";

const DOMAINS: ExceptionDomain[] = ["PROCUREMENT", "INVENTORY", "FULFILLMENT", "LOGISTICS"];
const SEVERITIES: ExceptionSeverity[] = ["CRITICAL", "WARNING", "INFO"];
const PAGE_SIZE = 25;

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const query = new URLSearchParams();
  query.set("range", "90d");
  if (params.domain) query.set("domain", params.domain);
  if (params.severity) query.set("severity", params.severity);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  let result: Paginated<ExceptionItem>;
  try {
    result = await apiGet<Paginated<ExceptionItem>>(`/analytics/exceptions?${query.toString()}`);
  } catch {
    return (
      <>
        <PageHeader title="Exceptions" />
        <ErrorState message="Could not load exceptions from the API." />
      </>
    );
  }

  const hasFilters = Boolean(params.domain || params.severity);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageQuery = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/exceptions?${q.toString()}`;
  };

  return (
    <>
      <PageHeader title="Exceptions" description={`${result.total} open exception${result.total === 1 ? "" : "s"} across procurement, inventory, fulfillment, and logistics`} />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-48">
            <Label htmlFor="domain">Domain</Label>
            <Select id="domain" name="domain" defaultValue={params.domain ?? ""}>
              <option value="">All domains</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {formatStatusLabel(d)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <Label htmlFor="severity">Severity</Label>
            <Select id="severity" name="severity" defaultValue={params.severity ?? ""}>
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {hasFilters && (
            <ButtonLink href="/exceptions" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={hasFilters ? "No exceptions match these filters" : "No open exceptions"} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Severity</Th>
                <Th>Domain</Th>
                <Th>Type</Th>
                <Th>Entity</Th>
                <Th>Message</Th>
                <Th>Detected</Th>
              </Tr>
            </Thead>
            <Tbody>
              {result.items.map((exception) => (
                <Tr key={exception.id}>
                  <Td>
                    <Badge tone={severityTone(exception.severity)}>{exception.severity}</Badge>
                  </Td>
                  <Td className="text-ink-soft">{formatStatusLabel(exception.domain)}</Td>
                  <Td className="text-ink-soft">{formatStatusLabel(exception.type)}</Td>
                  <Td>
                    <Link href={exception.href} className="font-medium text-accent hover:underline">
                      {exception.entityLabel}
                    </Link>
                  </Td>
                  <Td className="max-w-md text-ink-soft">{exception.message}</Td>
                  <Td className="text-ink-soft">{formatDateTime(exception.detectedAt)}</Td>
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
