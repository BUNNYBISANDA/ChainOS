import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, Truck } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { PurchaseOrder } from "@/lib/types";
import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { ActionButton } from "@/components/action-button";
import { approvePurchaseOrderAction, cancelPurchaseOrderAction } from "@/lib/actions/purchase-orders";
import { poStatusTone, shipmentStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ReceiveForm } from "./receive-form";
import { CreateShipmentButton } from "./create-shipment-button";

const RECEIVABLE_STATUSES = ["SHIPPED", "PARTIALLY_RECEIVED"];

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let po: PurchaseOrder;
  try {
    po = await apiGet<PurchaseOrder>(`/purchase-orders/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this purchase order." />;
  }

  const user = await getCurrentUser();
  const canApprove = user?.permissions.includes("po:approve") ?? false;
  const canReceive = user?.permissions.includes("po:receive") ?? false;
  const canCreate = user?.permissions.includes("po:create") ?? false;

  const orderedValue = po.lines.reduce((sum, l) => sum + l.qtyOrdered * Number(l.unitCost), 0);
  const receivedValue = po.lines.reduce((sum, l) => sum + l.qtyReceived * Number(l.unitCost), 0);
  const canReceiveNow = canReceive && RECEIVABLE_STATUSES.includes(po.status);

  return (
    <>
      <PageHeader
        title={po.poNumber}
        description={po.supplier?.name}
        action={
          <div className="flex items-center gap-2">
            {po.status === "DRAFT" && canApprove && (
              <ActionButton action={approvePurchaseOrderAction.bind(null, po.id)} variant="primary">
                <CheckCircle2 className="size-4" /> Approve Purchase Order
              </ActionButton>
            )}
            {po.status === "APPROVED" && !po.shipment && canCreate && <CreateShipmentButton purchaseOrderId={po.id} />}
            {!["RECEIVED", "CANCELLED"].includes(po.status) && canCreate && (
              <ActionButton
                action={cancelPurchaseOrderAction.bind(null, po.id)}
                variant="ghost"
                confirmMessage={`Cancel purchase order ${po.poNumber}? This cannot be undone.`}
              >
                <XCircle className="size-4" /> Cancel
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Stat label="Status">
          <Badge tone={poStatusTone(po.status)}>{formatStatusLabel(po.status)}</Badge>
        </Stat>
        <Stat label="Order value">{formatMoney(po.currency, orderedValue)}</Stat>
        <Stat label="Received value">{formatMoney(po.currency, receivedValue)}</Stat>
        <Stat label="Expected delivery">{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : "—"}</Stat>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Supplier">
                {po.supplier ? (
                  <Link href={`/suppliers/${po.supplier.id}`} className="text-accent hover:underline">
                    {po.supplier.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Warehouse">
                {po.warehouse ? (
                  <Link href={`/warehouses/${po.warehouse.id}`} className="text-accent hover:underline">
                    {po.warehouse.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Order date">{formatDate(po.orderDate)}</Field>
              <Field label="Currency">{po.currency}</Field>
              <Field label="Approved">{po.approvedAt ? formatDateTime(po.approvedAt) : "Not yet approved"}</Field>
              <Field label="Notes">{po.notes || "—"}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inbound shipment</CardTitle>
          </CardHeader>
          <CardBody>
            {po.shipment ? (
              <div className="flex items-center justify-between">
                <div>
                  <Link href={`/shipments/${po.shipment.id}`} className="font-medium text-accent hover:underline">
                    {po.shipment.shipmentNumber}
                  </Link>
                  <p className="mt-1 text-xs text-ink-faint">Manual tracking</p>
                </div>
                <Badge tone={shipmentStatusTone(po.shipment.status)}>{formatStatusLabel(po.shipment.status)}</Badge>
              </div>
            ) : po.status === "APPROVED" ? (
              <div className="flex items-center gap-3 text-sm text-ink-soft">
                <Truck className="size-4" />
                No shipment linked yet — create one to move this PO forward.
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                {po.status === "DRAFT" ? "Approve this purchase order first." : "—"}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{canReceiveNow ? "Receive goods" : "Order lines"}</CardTitle>
        </CardHeader>
        <CardBody>
          {canReceiveNow ? (
            <ReceiveForm purchaseOrderId={po.id} lines={po.lines} />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Product</Th>
                  <Th className="text-right">Ordered</Th>
                  <Th className="text-right">Received</Th>
                  <Th className="text-right">Unit Cost</Th>
                  <Th className="text-right">Line Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {po.lines.map((line) => (
                  <Tr key={line.id}>
                    <Td>
                      <span className="font-mono text-xs text-ink-soft">{line.product?.sku}</span> {line.product?.name}
                    </Td>
                    <Td className="text-right">{line.qtyOrdered.toLocaleString()}</Td>
                    <Td className="text-right">{line.qtyReceived.toLocaleString()}</Td>
                    <Td className="text-right">{formatMoney(po.currency, Number(line.unitCost))}</Td>
                    <Td className="text-right font-medium">
                      {formatMoney(po.currency, line.qtyOrdered * Number(line.unitCost))}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          {po.status === "RECEIVED" && (
            <p className="mt-3 text-sm text-success">This purchase order has been fully received.</p>
          )}
        </CardBody>
      </Card>

      {po.goodsReceipts && po.goodsReceipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Receiving history</CardTitle>
          </CardHeader>
          <Table>
            <Thead>
              <Tr>
                <Th>Received at</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Total quantity</Th>
              </Tr>
            </Thead>
            <Tbody>
              {po.goodsReceipts.map((gr) => (
                <Tr key={gr.id}>
                  <Td>{formatDateTime(gr.receivedAt)}</Td>
                  <Td className="text-right">{gr.lines.length}</Td>
                  <Td className="text-right">{gr.lines.reduce((sum, l) => sum + l.qtyReceived, 0).toLocaleString()}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
