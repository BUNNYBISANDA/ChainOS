import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, CheckCircle2, PackageCheck, Ship, XCircle } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/lib/types";
import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { ActionButton } from "@/components/action-button";
import { transitionShipmentAction } from "@/lib/actions/shipments";
import { shipmentStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDateTime } from "@/lib/format";

const NEXT_ACTION: Partial<Record<ShipmentStatus, { action: "book" | "dispatch" | "arrive" | "deliver"; label: string; icon: typeof BookMarked }>> = {
  CREATED: { action: "book", label: "Book", icon: BookMarked },
  BOOKED: { action: "dispatch", label: "Dispatch", icon: Ship },
  IN_TRANSIT: { action: "arrive", label: "Arrive", icon: PackageCheck },
  ARRIVED: { action: "deliver", label: "Deliver", icon: CheckCircle2 },
};

const CANCELLABLE: ShipmentStatus[] = ["CREATED", "BOOKED", "IN_TRANSIT"];

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let shipment: Shipment;
  try {
    shipment = await apiGet<Shipment>(`/shipments/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this shipment." />;
  }

  const user = await getCurrentUser();
  const canUpdate = user?.permissions.includes("shipment:update") ?? false;
  const next = NEXT_ACTION[shipment.status];
  const NextIcon = next?.icon;
  const relatedOrder = shipment.purchaseOrder
    ? { href: `/purchase-orders/${shipment.purchaseOrder.id}`, label: shipment.purchaseOrder.poNumber }
    : shipment.salesOrder
      ? { href: `/sales-orders/${shipment.salesOrder.id}`, label: shipment.salesOrder.orderNumber }
      : null;

  return (
    <>
      <PageHeader
        title={shipment.shipmentNumber}
        description={`${shipment.direction} manual tracking`}
        action={
          <div className="flex items-center gap-2">
            {next && canUpdate && (
              <ActionButton action={transitionShipmentAction.bind(null, shipment.id, next.action)} variant="primary">
                {NextIcon && <NextIcon className="size-4" />} {next.label}
              </ActionButton>
            )}
            {CANCELLABLE.includes(shipment.status) && canUpdate && (
              <ActionButton
                action={transitionShipmentAction.bind(null, shipment.id, "cancel")}
                variant="ghost"
                confirmMessage={`Cancel shipment ${shipment.shipmentNumber}?`}
              >
                <XCircle className="size-4" /> Cancel
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
              <Field label="Direction">
                <Badge tone={shipment.direction === "OUTBOUND" ? "accent" : "info"}>{shipment.direction}</Badge>
              </Field>
              <Field label="Status">
                <Badge tone={shipmentStatusTone(shipment.status)}>{formatStatusLabel(shipment.status)}</Badge>
              </Field>
              <Field label={shipment.direction === "OUTBOUND" ? "Sales order" : "Purchase order"}>
                {relatedOrder ? (
                  <Link href={relatedOrder.href} className="text-accent hover:underline">
                    {relatedOrder.label}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Customer">{shipment.destCustomer?.companyName ?? shipment.salesOrder?.customer?.companyName ?? "-"}</Field>
              <Field label="Origin">
                {shipment.direction === "OUTBOUND" ? shipment.originWarehouse?.name ?? "-" : shipment.purchaseOrder?.supplier?.name ?? "-"}
              </Field>
              <Field label="Destination">
                {shipment.direction === "OUTBOUND"
                  ? shipment.destCustomer?.companyName ?? shipment.salesOrder?.customer?.companyName ?? "-"
                  : shipment.destWarehouse?.name ?? "-"}
              </Field>
              <Field label="Carrier">{shipment.carrier || "-"}</Field>
              <Field label="Tracking number">{shipment.trackingNumber || "-"}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status timeline</CardTitle>
          </CardHeader>
          <CardBody>
            {shipment.events && shipment.events.length > 0 ? (
              <ol className="space-y-3">
                {shipment.events.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                    <div>
                      <p className="font-medium text-ink">{formatStatusLabel(event.status)}</p>
                      <p className="text-xs text-ink-faint">{formatDateTime(event.occurredAt)}</p>
                      {event.note && <p className="mt-0.5 text-ink-soft">{event.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-faint">No status events recorded yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
