import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Customer, Product, SalesOrder, StockLevel, Warehouse } from "@/lib/types";
import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { allocateSalesOrderAction, cancelSalesOrderAction, confirmSalesOrderAction } from "@/lib/actions/sales-orders";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatStatusLabel, salesOrderStatusTone, shipmentStatusTone } from "@/lib/status";
import { availableQuantity, lineProduct, salesOrderTotal, stockForLine } from "@/lib/sales-orders";
import { CreateOutboundShipmentButton } from "./create-outbound-shipment-button";
import { FulfillSalesOrderForm } from "./fulfill-sales-order-form";

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let orders: SalesOrder[];
  let customers: Customer[];
  let warehouses: Warehouse[];
  let products: Product[];
  let stockLevels: StockLevel[];
  try {
    [orders, customers, warehouses, products, stockLevels] = await Promise.all([
      apiGet<SalesOrder[]>("/sales-orders"),
      apiGet<Customer[]>("/customers"),
      apiGet<Warehouse[]>("/warehouses"),
      apiGet<Product[]>("/products"),
      apiGet<StockLevel[]>("/stock-levels"),
    ]);
  } catch {
    return <ErrorState message="Could not load this sales order." />;
  }

  const order = orders.find((item) => item.id === id);
  if (!order) notFound();

  const customer = order.customer ?? customers.find((item) => item.id === order.customerId);
  const warehouse = order.warehouse ?? warehouses.find((item) => item.id === order.warehouseId);
  const user = await getCurrentUser();
  const canConfirm = user?.permissions.includes("sales-order:confirm") ?? false;
  const canAllocate = user?.permissions.includes("sales-order:allocate") ?? false;
  const canFulfill = user?.permissions.includes("sales-order:fulfill") ?? false;
  const canCancel = user?.permissions.includes("sales-order:cancel") ?? false;
  const canCreateShipment = user?.permissions.includes("shipment:create") ?? false;

  const hasShipment = Boolean(order.shipment);
  const canConfirmNow = canConfirm && order.status === "DRAFT";
  const canAllocateNow = canAllocate && order.status === "CONFIRMED";
  const canFulfillNow = canFulfill && ["ALLOCATED", "PARTIALLY_FULFILLED"].includes(order.status);
  const canCreateShipmentNow = canCreateShipment && ["ALLOCATED", "PARTIALLY_FULFILLED", "FULFILLED"].includes(order.status) && !hasShipment;
  const canCancelNow = canCancel && !["FULFILLED", "CANCELLED"].includes(order.status);

  const fulfillableLines = order.lines
    .map((line) => ({
      salesOrderLineId: line.id,
      productLabel: `${lineProduct(line, products)?.sku ?? line.productId.slice(0, 8)} — ${lineProduct(line, products)?.name ?? "Unknown product"}`,
      remaining: line.qtyReserved,
    }))
    .filter((line) => line.remaining > 0);

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={customer?.companyName}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canConfirmNow && (
              <ActionButton action={confirmSalesOrderAction.bind(null, order.id)} variant="primary">
                <ClipboardCheck className="size-4" /> Confirm
              </ActionButton>
            )}
            {canAllocateNow && (
              <ActionButton action={allocateSalesOrderAction.bind(null, order.id)} variant="primary">
                <CheckCircle2 className="size-4" /> Allocate Inventory
              </ActionButton>
            )}
            {canCreateShipmentNow && <CreateOutboundShipmentButton salesOrderId={order.id} />}
            {canCancelNow && (
              <ActionButton
                action={cancelSalesOrderAction.bind(null, order.id)}
                variant="ghost"
                confirmMessage="Cancel this sales order? Any reserved inventory that hasn't been fulfilled yet will be released."
              >
                Cancel
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        <Stat label="Status">
          <Badge tone={salesOrderStatusTone(order.status)}>{formatStatusLabel(order.status)}</Badge>
        </Stat>
        <Stat label="Warehouse">{warehouse?.name ?? "-"}</Stat>
        <Stat label="Requested delivery">{order.requestedDeliveryDate ? formatDate(order.requestedDeliveryDate) : "-"}</Stat>
        <Stat label="Total">{formatMoney(order.currency ?? "THB", salesOrderTotal(order))}</Stat>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
              <Field label="Customer">
                {customer ? (
                  <Link href={`/customers/${customer.id}`} className="text-accent hover:underline">
                    {customer.companyName}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Warehouse">
                {warehouse ? (
                  <Link href={`/warehouses/${warehouse.id}`} className="text-accent hover:underline">
                    {warehouse.name}
                  </Link>
                ) : (
                  "-"
                )}
              </Field>
              <Field label="Order date">{formatDate(order.orderDate ?? order.createdAt)}</Field>
              <Field label="Currency">{order.currency ?? "THB"}</Field>
              <Field label="Notes">{order.notes ?? "-"}</Field>
              <Field label="Confirmed">{order.confirmedAt ? formatDate(order.confirmedAt) : "-"}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outbound shipment</CardTitle>
          </CardHeader>
          <CardBody>
            {order.shipment ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Link href={`/shipments/${order.shipment.id}`} className="font-medium text-accent hover:underline">
                    {order.shipment.shipmentNumber}
                  </Link>
                  <p className="mt-1 text-xs text-ink-faint">Warehouse to customer</p>
                </div>
                <Badge tone={shipmentStatusTone(order.shipment.status)}>{formatStatusLabel(order.shipment.status)}</Badge>
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                {order.status === "DRAFT" || order.status === "CONFIRMED"
                  ? "Allocate inventory before creating an outbound shipment."
                  : "No outbound shipment linked yet."}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {canFulfillNow && fulfillableLines.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Fulfill</CardTitle>
          </CardHeader>
          <CardBody>
            <FulfillSalesOrderForm salesOrderId={order.id} lines={fulfillableLines} />
          </CardBody>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Inventory availability</CardTitle>
        </CardHeader>
        <Table>
          <Thead>
            <Tr>
              <Th>Product</Th>
              <Th className="text-right">Ordered</Th>
              <Th className="text-right">Reserved</Th>
              <Th className="text-right">Fulfilled</Th>
              <Th className="text-right">Remaining</Th>
              <Th className="text-right">On Hand</Th>
              <Th className="text-right">Available</Th>
              <Th className="text-right">Unit Price</Th>
            </Tr>
          </Thead>
          <Tbody>
            {order.lines.map((line) => {
              const product = lineProduct(line, products);
              const stock = stockForLine(line, order, stockLevels);
              const remaining = Math.max(line.qtyOrdered - line.qtyFulfilled, 0);
              const available = availableQuantity(stock);
              const insufficient = order.status === "CONFIRMED" && available < line.qtyOrdered;
              return (
                <Tr key={line.id} className={insufficient ? "bg-danger/5" : undefined}>
                  <Td>
                    <span className="font-mono text-xs text-ink-soft">{product?.sku ?? line.productId.slice(0, 8)}</span>{" "}
                    {product?.name ?? "Unknown product"}
                    {insufficient && warehouse && (
                      <p className="mt-1 text-xs text-danger">
                        Only {formatNumber(available)} units are available in {warehouse.name}. This order requires{" "}
                        {formatNumber(line.qtyOrdered)}.
                      </p>
                    )}
                  </Td>
                  <Td className="text-right">{formatNumber(line.qtyOrdered)}</Td>
                  <Td className="text-right">{formatNumber(line.qtyReserved)}</Td>
                  <Td className="text-right">{formatNumber(line.qtyFulfilled)}</Td>
                  <Td className="text-right">{formatNumber(remaining)}</Td>
                  <Td className="text-right">{formatNumber(stock?.quantityOnHand ?? 0)}</Td>
                  <Td className="text-right">{formatNumber(available)}</Td>
                  <Td className="text-right">{formatMoney(order.currency ?? "THB", Number(line.unitPrice))}</Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Card>
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
