import Link from "next/link";
import { Truck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { shipmentStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDate } from "@/lib/format";

const STATUSES: ShipmentStatus[] = ["CREATED", "BOOKED", "IN_TRANSIT", "ARRIVED", "DELIVERED", "CANCELLED"];

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.direction) query.set("direction", params.direction);

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

  const hasFilters = Boolean(params.status || params.direction);

  return (
    <>
      <PageHeader title="Shipments" description={`${shipments.length} shipment${shipments.length === 1 ? "" : "s"}`} />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
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
            <Label htmlFor="direction">Direction</Label>
            <Select id="direction" name="direction" defaultValue={params.direction ?? ""}>
              <option value="">Both</option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
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
                <Th>Created</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shipments.map((shipment) => (
                <Tr key={shipment.id}>
                  <Td>
                    <Link href={`/shipments/${shipment.id}`} className="font-medium text-accent hover:underline">
                      {shipment.shipmentNumber}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={shipment.direction === "OUTBOUND" ? "accent" : "info"}>{shipment.direction}</Badge>
                  </Td>
                  <Td className="text-ink-soft">
                    {shipment.purchaseOrder ? (
                      <Link href={`/purchase-orders/${shipment.purchaseOrder.id}`} className="text-accent hover:underline">
                        {shipment.purchaseOrder.poNumber}
                      </Link>
                    ) : shipment.salesOrder ? (
                      <Link href={`/sales-orders/${shipment.salesOrder.id}`} className="text-accent hover:underline">
                        {shipment.salesOrder.orderNumber}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td className="text-ink-soft">
                    {shipment.direction === "OUTBOUND"
                      ? shipment.originWarehouse?.name ?? "-"
                      : shipment.purchaseOrder?.supplier?.name ?? "-"}
                  </Td>
                  <Td className="text-ink-soft">
                    {shipment.direction === "OUTBOUND"
                      ? shipment.destCustomer?.companyName ?? shipment.salesOrder?.customer?.companyName ?? "-"
                      : shipment.destWarehouse?.name ?? "-"}
                  </Td>
                  <Td className="text-ink-soft">{formatDate(shipment.createdAt)}</Td>
                  <Td>
                    <Badge tone={shipmentStatusTone(shipment.status)}>{formatStatusLabel(shipment.status)}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
