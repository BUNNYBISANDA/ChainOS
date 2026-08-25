import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, Ship, PackageCheck, CheckCircle2, XCircle } from "lucide-react";
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
  CREATED: { action: "book", label: "Mark as Booked", icon: BookMarked },
  BOOKED: { action: "dispatch", label: "Mark as In Transit", icon: Ship },
  IN_TRANSIT: { action: "arrive", label: "Mark as Arrived", icon: PackageCheck },
  ARRIVED: { action: "deliver", label: "Mark as Delivered", icon: CheckCircle2 },
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

  return (
    <>
      <PageHeader
        title={shipment.shipmentNumber}
        description={`${shipment.direction} · manual tracking`}
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

      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Status">
                <Badge tone={shipmentStatusTone(shipment.status)}>{formatStatusLabel(shipment.status)}</Badge>
              </Field>
              <Field label="Purchase order">
                {shipment.purchaseOrder ? (
                  <Link href={`/purchase-orders/${shipment.purchaseOrder.id}`} className="text-accent hover:underline">
                    {shipment.purchaseOrder.poNumber}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Origin">{shipment.purchaseOrder?.supplier?.name ?? "—"}</Field>
              <Field label="Destination">
                {shipment.destWarehouse ? (
                  <Link href={`/warehouses/${shipment.destWarehouse.id}`} className="text-accent hover:underline">
                    {shipment.destWarehouse.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Carrier">{shipment.carrier || "—"}</Field>
              <Field label="Tracking number">{shipment.trackingNumber || "—"}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status timeline</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="space-y-3">
              {shipment.events?.map((event) => (
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
