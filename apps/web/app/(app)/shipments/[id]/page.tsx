import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BookMarked, CheckCircle2, MapPin, PackageCheck, Ship, Truck, XCircle } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { Shipment, ShipmentStatus } from "@/lib/types";
import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { ActionButton } from "@/components/action-button";
import { transitionShipmentAction } from "@/lib/actions/shipments";
import { shipmentStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import { TrackingUpdateForm } from "./tracking-update-form";
import { EtaUpdateForm } from "./eta-update-form";
import { ShipmentMap, type ShipmentMapPoint } from "./shipment-map";

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
  const canTrack = user?.permissions.includes("shipment:tracking:create") ?? false;
  const canUpdateEta = user?.permissions.includes("shipment:eta:update") ?? false;
  const next = NEXT_ACTION[shipment.status];
  const NextIcon = next?.icon;
  const relatedOrder = shipment.purchaseOrder
    ? { href: `/purchase-orders/${shipment.purchaseOrder.id}`, label: shipment.purchaseOrder.poNumber, type: "Purchase order" }
    : shipment.salesOrder
      ? { href: `/sales-orders/${shipment.salesOrder.id}`, label: shipment.salesOrder.orderNumber, type: "Sales order" }
      : null;
  const openExceptions = shipment.exceptions?.filter((exception) => exception.status === "OPEN") ?? [];
  const mapPoints = buildMapPoints(shipment);

  return (
    <>
      <PageHeader
        title={shipment.shipmentNumber}
        description={`${shipment.direction} logistics visibility`}
        action={
          <div className="flex flex-wrap items-center gap-2">
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

      <div className="mb-6 grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        <Stat label="Status">
          <Badge tone={shipmentStatusTone(shipment.status)}>{formatStatusLabel(shipment.status)}</Badge>
        </Stat>
        <Stat label="Exception">
          {openExceptions.length > 0 ? (
            <ExceptionBadge type={openExceptions[0].type} severity={openExceptions[0].severity} />
          ) : (
            <span className="text-success">None open</span>
          )}
        </Stat>
        <Stat label="ETA">{shipment.estimatedArrivalAt ? formatDateTime(shipment.estimatedArrivalAt) : "No ETA"}</Stat>
        <Stat label="Current Location">{shipment.currentLocationName ?? "Unknown"}</Stat>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <RoutePoint icon={MapPin} label="Origin" value={shipment.originName ?? originLabel(shipment)} />
        <RoutePoint icon={Truck} label="Current" value={shipment.currentLocationName ?? "No tracking location yet"} />
        <RoutePoint icon={MapPin} label="Destination" value={shipment.destinationName ?? destinationLabel(shipment)} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Related entities</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
              <Field label="Direction">
                <Badge tone={shipment.direction === "OUTBOUND" ? "accent" : "info"}>{shipment.direction}</Badge>
              </Field>
              <Field label={relatedOrder?.type ?? "Order"}>
                {relatedOrder ? (
                  <Link href={relatedOrder.href} className="text-accent hover:underline">
                    {relatedOrder.label}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Supplier">{shipment.purchaseOrder?.supplier?.name ?? "-"}</Field>
              <Field label="Customer">{shipment.destCustomer?.companyName ?? shipment.salesOrder?.customer?.companyName ?? "-"}</Field>
              <Field label="Warehouse">{shipment.originWarehouse?.name ?? shipment.destWarehouse?.name ?? "-"}</Field>
              <Field label="Carrier">{shipment.carrier || "-"}</Field>
              <Field label="Tracking number">{shipment.trackingNumber || "-"}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ETA</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
              <Field label="Planned departure">{shipment.plannedDepartureAt ? formatDateTime(shipment.plannedDepartureAt) : "-"}</Field>
              <Field label="Planned arrival">{shipment.plannedArrivalAt ? formatDateTime(shipment.plannedArrivalAt) : "-"}</Field>
              <Field label="Actual departure">{shipment.actualDepartureAt ? formatDateTime(shipment.actualDepartureAt) : "-"}</Field>
              <Field label="Actual arrival">{shipment.actualArrivalAt ? formatDateTime(shipment.actualArrivalAt) : "-"}</Field>
            </dl>
            {canUpdateEta ? <EtaUpdateForm shipmentId={shipment.id} /> : <p className="text-sm text-ink-faint">You do not have ETA update permission.</p>}
          </CardBody>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Map</CardTitle>
          </CardHeader>
          <CardBody>
            <ShipmentMap points={mapPoints} />
            <p className="mt-2 text-xs text-ink-faint">Line is a shipment direction indicator, not an optimized road route.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exceptions</CardTitle>
          </CardHeader>
          <CardBody>
            {shipment.exceptions && shipment.exceptions.length > 0 ? (
              <ul className="space-y-3">
                {shipment.exceptions.map((exception) => (
                  <li key={exception.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <ExceptionBadge type={exception.type} severity={exception.severity} />
                      <Badge tone={exception.status === "OPEN" ? "warning" : "success"}>{exception.status}</Badge>
                    </div>
                    <p className="mt-2 text-ink-soft">{exception.message}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      Detected {formatDateTime(exception.detectedAt)}
                      {exception.resolvedAt ? `; resolved ${formatDateTime(exception.resolvedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">No exceptions recorded.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardBody>
            {shipment.events && shipment.events.length > 0 ? (
              <ol className="space-y-4">
                {shipment.events.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-accent" />
                    <div>
                      <p className="font-medium text-ink">{formatStatusLabel(event.eventType)}</p>
                      <p className="text-xs text-ink-faint">
                        {formatDateTime(event.eventTimestamp)} - {event.source}
                      </p>
                      {event.locationName && <p className="mt-1 text-ink-soft">{event.locationName}</p>}
                      {(event.notes || event.note) && <p className="mt-1 text-ink-soft">{event.notes ?? event.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-faint">No tracking events recorded yet.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add Tracking Update</CardTitle>
          </CardHeader>
          <CardBody>
            {canTrack ? (
              <TrackingUpdateForm shipmentId={shipment.id} />
            ) : (
              <p className="text-sm text-ink-faint">You do not have tracking update permission.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
        <div className="mt-1 text-lg font-semibold text-ink">{children}</div>
      </CardBody>
    </Card>
  );
}

function RoutePoint({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
          <Icon className="size-4" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
          <p className="mt-1 font-medium text-ink">{value}</p>
        </div>
      </CardBody>
    </Card>
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

function ExceptionBadge({ type, severity }: { type: string; severity: string }) {
  const tone: NonNullable<BadgeProps["tone"]> = severity === "CRITICAL" ? "danger" : "warning";
  return (
    <Badge tone={tone}>
      <AlertTriangle className="mr-1 size-3" aria-hidden />
      {formatStatusLabel(type)}
    </Badge>
  );
}

function originLabel(shipment: Shipment): string {
  return shipment.direction === "OUTBOUND" ? shipment.originWarehouse?.name ?? "-" : shipment.purchaseOrder?.supplier?.name ?? "-";
}

function destinationLabel(shipment: Shipment): string {
  return shipment.direction === "OUTBOUND"
    ? shipment.destCustomer?.companyName ?? shipment.salesOrder?.customer?.companyName ?? "-"
    : shipment.destWarehouse?.name ?? "-";
}

function buildMapPoints(shipment: Shipment): ShipmentMapPoint[] {
  const points: ShipmentMapPoint[] = [];
  pushPoint(points, "Origin", shipment.originName ?? originLabel(shipment), shipment.originLatitude, shipment.originLongitude);
  pushPoint(points, "Current", shipment.currentLocationName ?? "Current location", shipment.currentLatitude, shipment.currentLongitude);
  pushPoint(points, "Destination", shipment.destinationName ?? destinationLabel(shipment), shipment.destinationLatitude, shipment.destinationLongitude);
  return points;
}

function pushPoint(
  points: ShipmentMapPoint[],
  kind: ShipmentMapPoint["kind"],
  label: string,
  latitude: string | number | null,
  longitude: string | number | null,
) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  points.push({ kind, label, latitude: lat, longitude: lng });
}
