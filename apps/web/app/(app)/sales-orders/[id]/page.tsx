import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, PackageCheck, XCircle } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Customer, CustomerOrder, Product, StockLevel, Warehouse } from "@/lib/types";
import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { allocateSalesOrderAction, markSalesOrderReadyAction } from "@/lib/actions/sales-orders";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { formatStatusLabel, salesOrderStatusTone, shipmentStatusTone } from "@/lib/status";
import { availableQuantity, lineProduct, salesOrderNumber, salesOrderStatus, salesOrderTotal, stockForLine } from "@/lib/sales-orders";
import { CreateOutboundShipmentButton } from "./create-outbound-shipment-button";

export default async function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let orders: CustomerOrder[];
  let customers: Customer[];
  let warehouses: Warehouse[];
  let products: Product[];
  let stockLevels: StockLevel[];
  try {
    [orders, customers, warehouses, products, stockLevels] = await Promise.all([
      apiGet<CustomerOrder[]>("/customer-orders"),
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
  const status = salesOrderStatus(order);
  const user = await getCurrentUser();
  const canAllocate = user?.permissions.includes("order:reserve") ?? false;
  const canFulfill = user?.permissions.includes("order:ready") ?? false;
  const canCreateShipment = user?.permissions.includes("shipment:create") ?? false;
  const hasShipment = Boolean(order.shipment);
  const canAllocateNow = canAllocate && order.status === "DRAFT";
  const canCreateShipmentNow = canCreateShipment && ["RESERVED", "ALLOCATED", "READY_TO_SHIP", "SHIPPED"].includes(order.status) && !hasShipment;
  const canFulfillNow = canFulfill && order.status === "RESERVED";

  return (
    <>
      <PageHeader
        title={salesOrderNumber(order)}
        description={customer?.name}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canAllocateNow && (
              <ActionButton action={allocateSalesOrderAction.bind(null, order.id)} variant="primary">
                <CheckCircle2 className="size-4" /> Allocate Inventory
              </ActionButton>
            )}
            {canCreateShipmentNow && <CreateOutboundShipmentButton salesOrderId={order.id} warehouseId={order.warehouseId} />}
            {canFulfillNow && (
              <ActionButton
                action={markSalesOrderReadyAction.bind(null, order.id)}
                variant="secondary"
                confirmMessage="Fulfill all currently reserved lines? The current backend does not support partial fulfillment yet."
              >
                <PackageCheck className="size-4" /> Fulfill Reserved Inventory
              </ActionButton>
            )}
            {!["FULFILLED", "DELIVERED", "CANCELLED"].includes(status) && (
              <ButtonLink href="/sales-orders" variant="ghost">
                <XCircle className="size-4" /> Cancel Pending Backend
              </ButtonLink>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-md:grid-cols-1">
        <Stat label="Status">
          <Badge tone={salesOrderStatusTone(status)}>{formatStatusLabel(status)}</Badge>
        </Stat>
        <Stat label="Warehouse">{warehouse?.name ?? "-"}</Stat>
        <Stat label="Requested delivery">{order.requestedDeliveryDate ? formatDate(order.requestedDeliveryDate) : "Backend pending"}</Stat>
        <Stat label="Total">{formatMoney(order.currency ?? "THB", salesOrderTotal(order))}</Stat>
      </div>

      {canFulfillNow && (
        <Banner tone="warning" className="mb-6">
          Partial fulfillment needs the Phase 2 backend contract. This action fulfills the full reserved order using the current
          backend&apos;s ready-to-ship transition.
        </Banner>
      )}

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
                    {customer.name}
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
                {status === "DRAFT" ? "Allocate inventory before creating an outbound shipment." : "No outbound shipment linked yet."}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

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
              const reserved = line.qtyReserved ?? (["RESERVED", "READY_TO_SHIP", "SHIPPED"].includes(order.status) ? line.qtyOrdered : 0);
              const fulfilled = line.qtyFulfilled ?? 0;
              const remaining = Math.max(line.qtyOrdered - fulfilled, 0);
              const available = availableQuantity(stock);
              const insufficient = order.status === "DRAFT" && available < line.qtyOrdered;
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
                  <Td className="text-right">{formatNumber(reserved)}</Td>
                  <Td className="text-right">{formatNumber(fulfilled)}</Td>
                  <Td className="text-right">{formatNumber(remaining)}</Td>
                  <Td className="text-right">{formatNumber(stock?.quantityOnHand ?? 0)}</Td>
                  <Td className="text-right">{formatNumber(available)}</Td>
                  <Td className="text-right">{line.unitPrice ? formatMoney(order.currency ?? "THB", Number(line.unitPrice)) : "Backend pending"}</Td>
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
