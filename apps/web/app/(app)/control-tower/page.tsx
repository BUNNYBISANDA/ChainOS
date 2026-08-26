import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Clock,
  PackageSearch,
  ShoppingCart,
  Target,
  Truck,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ControlTowerSummary, OtifTrendPoint, PoValueTrendPoint, InventoryMovementPoint, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { severityTone, formatStatusLabel } from "@/lib/status";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { NetworkMap } from "./network-map";
import { OtifTrendChart, PoValueTrendChart, InventoryFlowChart } from "@/components/charts/trend-charts";

const RANGE_PRESETS: Array<{ value: string; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

export default async function ControlTowerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.from && params.to) {
    query.set("from", params.from);
    query.set("to", params.to);
  } else if (params.range) {
    query.set("range", params.range);
  }
  if (params.warehouseId) query.set("warehouseId", params.warehouseId);
  const qs = query.toString();

  let summary: ControlTowerSummary;
  let otifTrend: OtifTrendPoint[];
  let poValueTrend: PoValueTrendPoint[];
  let inventoryFlow: InventoryMovementPoint[];
  let warehouses: Warehouse[];
  try {
    [summary, otifTrend, poValueTrend, inventoryFlow, warehouses] = await Promise.all([
      apiGet<ControlTowerSummary>(`/analytics/control-tower${qs ? `?${qs}` : ""}`),
      apiGet<OtifTrendPoint[]>(`/analytics/fulfillment/otif-trend${qs ? `?${qs}` : ""}`),
      apiGet<PoValueTrendPoint[]>(`/analytics/procurement/po-value-trend${qs ? `?${qs}` : ""}`),
      apiGet<InventoryMovementPoint[]>(`/analytics/inventory/movement-trend${qs ? `?${qs}` : ""}`),
      apiGet<Warehouse[]>("/warehouses"),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Supply Chain Control Tower" />
        <ErrorState message="Could not load Control Tower data from the API." />
      </>
    );
  }

  const hasCustomDates = Boolean(params.from && params.to);
  const activeRange = hasCustomDates ? "custom" : (params.range ?? "30d");
  const hasFilters = Boolean(params.range || params.warehouseId || hasCustomDates);

  return (
    <>
      <PageHeader
        title="Supply Chain Control Tower"
        description={`${formatDateTime(summary.period.from)} — ${formatDateTime(summary.period.to)} · Last updated ${formatDateTime(summary.lastUpdated)}`}
      />

      <Card className="mb-6">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-44">
            <Label htmlFor="range">Date Range</Label>
            <Select id="range" name="range" defaultValue={hasCustomDates ? "" : activeRange}>
              {RANGE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Label htmlFor="from">Custom From</Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
          </div>
          <div className="w-36">
            <Label htmlFor="to">Custom To</Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
          </div>
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
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {hasFilters && (
            <ButtonLink href="/control-tower" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      {/* Primary KPI row */}
      <div className="mb-6 grid grid-cols-4 gap-4 max-xl:grid-cols-2">
        <MetricCard
          icon={ClipboardList}
          label="Open Purchase Orders"
          value={summary.procurement.openPurchaseOrders}
          sub={formatMoney("THB", summary.procurement.openPurchaseOrderValue)}
          href="/purchase-orders"
        />
        <MetricCard icon={ShoppingCart} label="Open Sales Orders" value={summary.fulfillment.openSalesOrders} href="/sales-orders" />
        <MetricCard icon={Truck} label="Active Shipments" value={summary.logistics.activeShipments} href="/shipments" />
        <MetricCard icon={Target} label="Customer OTIF" value={formatPercent(summary.service.customerOtifPercent)} href="/sales-orders?status=FULFILLED" tone="accent" />
      </div>

      {/* Network Visibility */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Supply Chain Network Map</CardTitle>
        </CardHeader>
        <CardBody>
          <NetworkMap
            suppliers={summary.network.suppliers}
            warehouses={summary.network.warehouses}
            customers={summary.network.customers}
            activeShipments={summary.network.activeShipments}
            currentQuery={qs}
          />
        </CardBody>
      </Card>

      {/* Risk / Exception layer */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Inventory Risk</CardTitle>
            <Link href="/inventory/risk" className="text-xs font-medium text-accent hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4">
            <Stat label="Inventory Value" value={formatMoney("THB", summary.inventory.inventoryValue)} />
            <Stat label="SKUs At Risk" value={formatNumber(summary.inventory.skusAtRisk)} tone={summary.inventory.skusAtRisk > 0 ? "warning" : undefined} />
            <Stat label="Zero Available" value={formatNumber(summary.inventory.skusZeroAvailable)} tone={summary.inventory.skusZeroAvailable > 0 ? "danger" : undefined} />
            <Stat label="Missing Cost Price" value={formatNumber(summary.inventory.productsMissingCost)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational Exceptions</CardTitle>
            <Link href="/exceptions" className="text-xs font-medium text-accent hover:underline">
              View all
            </Link>
          </CardHeader>
          {summary.exceptions.top.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No open exceptions" />
          ) : (
            <Table>
              <Tbody>
                {summary.exceptions.top.map((exception) => (
                  <Tr key={exception.id}>
                    <Td>
                      <Badge tone={severityTone(exception.severity)}>{exception.severity}</Badge>
                    </Td>
                    <Td className="text-ink-soft">{formatStatusLabel(exception.domain)}</Td>
                    <Td>
                      <Link href={exception.href} className="text-accent hover:underline">
                        {exception.entityLabel}
                      </Link>
                    </Td>
                    <Td className="max-w-xs truncate text-ink-soft" title={exception.message}>
                      {exception.message}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* Performance */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Procurement Performance</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-3 gap-4">
            <Stat label="Overdue POs" value={formatNumber(summary.procurement.overduePurchaseOrders)} tone={summary.procurement.overduePurchaseOrders > 0 ? "danger" : undefined} href="/purchase-orders?overdue=true" />
            <Stat label="Partially Received" value={formatNumber(summary.procurement.partiallyReceivedPurchaseOrders)} href="/purchase-orders?status=PARTIALLY_RECEIVED" />
            <Stat label="Open PO Value" value={formatMoney("THB", summary.procurement.openPurchaseOrderValue)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fulfillment Performance</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-3 gap-4">
            <Stat label="Awaiting Allocation" value={formatNumber(summary.fulfillment.awaitingAllocation)} href="/sales-orders?status=CONFIRMED" />
            <Stat label="Partially Fulfilled" value={formatNumber(summary.fulfillment.partiallyFulfilled)} href="/sales-orders?status=PARTIALLY_FULFILLED" />
            <Stat label="Fulfilled" value={formatNumber(summary.fulfillment.fulfilled)} href="/sales-orders?status=FULFILLED" />
          </CardBody>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard icon={Truck} label="Inbound Active" value={summary.logistics.inboundActive} href="/shipments?direction=INBOUND" />
        <MetricCard icon={Truck} label="Outbound Active" value={summary.logistics.outboundActive} href="/shipments?direction=OUTBOUND" />
        <MetricCard icon={Clock} label="Delayed Shipments" value={summary.logistics.delayedShipments} href="/shipments?delayed=true" tone={summary.logistics.delayedShipments > 0 ? "warning" : undefined} />
        <MetricCard icon={Target} label="Logistics On-Time %" value={formatPercent(summary.logistics.onTimeDeliveryPercent)} href="/shipments?status=DELIVERED" />
      </div>

      {/* Trends */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <OtifTrendChart points={otifTrend} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <InventoryFlowChart points={inventoryFlow} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <PoValueTrendChart points={poValueTrend} />
          </CardBody>
        </Card>
      </div>

      {/* Supplier Performance */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Supplier Performance</CardTitle>
          <Link href="/analytics/suppliers" className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </CardHeader>
        {summary.topSuppliers.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No supplier activity in this period" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Supplier</Th>
                <Th className="text-right">Spend</Th>
                <Th className="text-right">POs</Th>
                <Th className="text-right">On-Time</Th>
                <Th className="text-right">OTIF</Th>
                <Th className="text-right">Late POs</Th>
              </Tr>
            </Thead>
            <Tbody>
              {summary.topSuppliers.map((supplier) => (
                <Tr key={supplier.supplierId}>
                  <Td>
                    <Link href={`/suppliers/${supplier.supplierId}`} className="font-medium text-accent hover:underline">
                      {supplier.supplierName}
                    </Link>
                  </Td>
                  <Td className="text-right">{formatMoney("THB", supplier.totalSpend)}</Td>
                  <Td className="text-right">{supplier.poCount}</Td>
                  <Td className="text-right">{formatPercent(supplier.onTimePercent)}</Td>
                  <Td className="text-right">{formatPercent(supplier.otifPercent)}</Td>
                  <Td className="text-right">{supplier.latePoCount}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      {/* Data Quality */}
      {summary.dataQuality.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Quality</CardTitle>
            <span className="text-xs text-ink-faint">{summary.dataQuality.total} data issue{summary.dataQuality.total === 1 ? "" : "s"}</span>
          </CardHeader>
          <CardBody>
            <ul className="space-y-1.5 text-sm text-ink-soft">
              {summary.dataQuality.issues.map((issue) => (
                <li key={issue.key}>
                  {issue.label}: <span className="font-medium text-ink">{issue.count}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tone,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string | number;
  sub?: string;
  href: string;
  tone?: "warning" | "danger" | "accent";
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-border-strong">
        <CardBody className="flex items-center gap-4">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${toneClasses(tone)}`}>
            <Icon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
            <p className="text-xl font-semibold text-ink">{value}</p>
            {sub && <p className="text-xs text-ink-faint">{sub}</p>}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: string; tone?: "warning" | "danger"; href?: string }) {
  const content = (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`text-lg font-semibold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink"}`}>{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {content}
    </Link>
  ) : (
    content
  );
}

function toneClasses(tone?: "warning" | "danger" | "accent"): string {
  if (tone === "warning") return "bg-warning-subtle text-warning";
  if (tone === "danger") return "bg-danger-subtle text-danger";
  return "bg-accent-subtle text-accent";
}
