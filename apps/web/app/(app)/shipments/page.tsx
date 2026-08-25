import Link from "next/link";
import { AlertTriangle, Clock, PackageCheck, Truck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { shipmentStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDateTime } from "@/lib/format";

const STATUSES: ShipmentStatus[] = ["CREATED", "BOOKED", "IN_TRANSIT", "ARRIVED", "DELIVERED", "CANCELLED"];
const ACTIVE_STATUSES: ShipmentStatus[] = ["CREATED", "BOOKED", "IN_TRANSIT", "ARRIVED"];

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.direction) query.set("direction", params.direction);
  if (params.delayed) query.set("delayed", params.delayed);
  if (params.needsAttention) query.set("needsAttention", params.needsAttention);
  if (params.search) query.set("search", params.search);

  let shipments: Shipment[];
  try {
    shipments = await apiGet<Shipment[]>(`/shipments${query.toString() ? `?${query}` : ""}`);
  } catch {
    return (
      <>
        <PageHeader title="Shipments" />
        <ErrorState message="Could not load shipments from the API." />
      </>
    );
  }

  const active = shipments.filter((s) => ACTIVE_STATUSES.includes(s.status));
  const inbound = shipments.filter((s) => s.direction === "INBOUND");
  const outbound = shipments.filter((s) => s.direction === "OUTBOUND");
  const delayed = shipments.filter((s) => openExceptions(s).some((e) => e.type === "ETA_EXCEEDED"));
  const attention = shipments.filter((s) => openExceptions(s).length > 0);
  const hasFilters = Boolean(params.status || params.direction || params.delayed || params.needsAttention || params.search);

  return (
    <>
      <PageHeader title="Shipments" description="Logistics visibility and manual tracking" />

      <div className="mb-6 grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-1">
        <MetricCard icon={Truck} label="Active Shipments" value={active.length} />
        <MetricCard icon={PackageCheck} label="Inbound" value={inbound.length} />
        <MetricCard icon={Truck} label="Outbound" value={outbound.length} />
        <MetricCard icon={Clock} label="Delayed" value={delayed.length} />
        <MetricCard icon={AlertTriangle} label="Needs Attention" value={attention.length} />
      </div>

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-44">
            <Label htmlFor="direction">Direction</Label>
            <Select id="direction" name="direction" defaultValue={params.direction ?? ""}>
              <option value="">All</option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
            </Select>
          </div>
          <div className="w-44">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={params.status ?? ""}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatusLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Label htmlFor="delayed">Delayed</Label>
            <Select id="delayed" name="delayed" defaultValue={params.delayed ?? ""}>
              <option value="">Any</option>
              <option value="true">Delayed only</option>
            </Select>
          </div>
          <div className="w-48">
            <Label htmlFor="needsAttention">Attention</Label>
            <Select id="needsAttention" name="needsAttention" defaultValue={params.needsAttention ?? ""}>
              <option value="">Any</option>
              <option value="true">Needs attention</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {hasFilters && (
            <ButtonLink href="/shipments" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {shipments.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={hasFilters ? "No shipments match these filters" : "No shipments yet"}
            description={hasFilters ? "Try broadening your filters." : "Shipments are created from approved purchase orders or allocated sales orders."}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Shipment</Th>
                <Th>Direction</Th>
                <Th>Related Order</Th>
                <Th>Origin</Th>
                <Th>Destination</Th>
                <Th>Current Location</Th>
                <Th>ETA</Th>
                <Th>Status</Th>
                <Th>Exception</Th>
                <Th>Updated</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shipments.map((shipment) => {
                const exceptions = openExceptions(shipment);
                const latest = shipment.events?.[0];
                return (
                  <Tr key={shipment.id}>
                    <Td>
                      <Link href={`/shipments/${shipment.id}`} className="font-medium text-accent hover:underline">
                        {shipment.shipmentNumber}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={shipment.direction === "OUTBOUND" ? "accent" : "info"}>{shipment.direction}</Badge>
                    </Td>
                    <Td className="text-ink-soft">{relatedOrder(shipment)}</Td>
                    <Td className="text-ink-soft">{shipment.originName ?? originLabel(shipment)}</Td>
                    <Td className="text-ink-soft">{shipment.destinationName ?? destinationLabel(shipment)}</Td>
                    <Td className="text-ink-soft">{shipment.currentLocationName ?? "-"}</Td>
                    <Td className="text-ink-soft">{shipment.estimatedArrivalAt ? formatDateTime(shipment.estimatedArrivalAt) : "-"}</Td>
                    <Td>
                      <Badge tone={shipmentStatusTone(shipment.status)}>{formatStatusLabel(shipment.status)}</Badge>
                    </Td>
                    <Td>{exceptions.length > 0 ? <ExceptionBadge type={exceptions[0].type} severity={exceptions[0].severity} /> : "-"}</Td>
                    <Td className="text-ink-soft">{latest ? formatDateTime(latest.eventTimestamp) : formatDateTime(shipment.createdAt)}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
          <Icon className="size-4" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
          <p className="text-lg font-semibold text-ink">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function openExceptions(shipment: Shipment) {
  return shipment.exceptions?.filter((exception) => exception.status === "OPEN") ?? [];
}

function relatedOrder(shipment: Shipment) {
  if (shipment.purchaseOrder) {
    return (
      <Link href={`/purchase-orders/${shipment.purchaseOrder.id}`} className="text-accent hover:underline">
        {shipment.purchaseOrder.poNumber}
      </Link>
    );
  }
  if (shipment.salesOrder) {
    return (
      <Link href={`/sales-orders/${shipment.salesOrder.id}`} className="text-accent hover:underline">
        {shipment.salesOrder.orderNumber}
      </Link>
    );
  }
  return "-";
}

function originLabel(shipment: Shipment): string {
  return shipment.direction === "OUTBOUND" ? shipment.originWarehouse?.name ?? "-" : shipment.purchaseOrder?.supplier?.name ?? "-";
}

function destinationLabel(shipment: Shipment): string {
  return shipment.direction === "OUTBOUND"
    ? shipment.destCustomer?.companyName ?? shipment.salesOrder?.customer?.companyName ?? "-"
    : shipment.destWarehouse?.name ?? "-";
}

function ExceptionBadge({ type, severity }: { type: string; severity: string }) {
  const tone: NonNullable<BadgeProps["tone"]> = severity === "CRITICAL" ? "danger" : "warning";
  return <Badge tone={tone}>{formatStatusLabel(type)}</Badge>;
}
