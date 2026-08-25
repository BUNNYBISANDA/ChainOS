import Link from "next/link";
import { ClipboardList, Truck, Coins, Boxes, PackageSearch, PackageCheck, ShoppingCart } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PurchaseOrder, SalesOrder, Shipment, StockLevel } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { poStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDate, formatNumber } from "@/lib/format";

const OPEN_PO_STATUSES = ["DRAFT", "APPROVED", "SHIPPED", "PARTIALLY_RECEIVED"];
const AWAITING_RECEIPT_STATUSES = ["SHIPPED", "PARTIALLY_RECEIVED"];
const ACTIVE_SHIPMENT_STATUSES = ["CREATED", "BOOKED", "IN_TRANSIT", "ARRIVED"];
const OPEN_SALES_ORDER_STATUSES = ["DRAFT", "CONFIRMED", "ALLOCATED", "PARTIALLY_FULFILLED"];

export default async function DashboardPage() {
  const [purchaseOrdersResult, shipmentsResult, stockLevelsResult, salesOrdersResult] = await Promise.allSettled([
    apiGet<PurchaseOrder[]>("/purchase-orders"),
    apiGet<Shipment[]>("/shipments"),
    apiGet<StockLevel[]>("/stock-levels"),
    apiGet<SalesOrder[]>("/sales-orders"),
  ]);

  if (stockLevelsResult.status === "rejected") {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState message="Could not load inventory data from the API." />
      </>
    );
  }

  const purchaseOrders = purchaseOrdersResult.status === "fulfilled" ? purchaseOrdersResult.value : [];
  const shipments = shipmentsResult.status === "fulfilled" ? shipmentsResult.value : [];
  const stockLevels = stockLevelsResult.value;
  const salesOrders = salesOrdersResult.status === "fulfilled" ? salesOrdersResult.value : [];
  const hasPartialData =
    purchaseOrdersResult.status === "rejected" || shipmentsResult.status === "rejected" || salesOrdersResult.status === "rejected";

  const openPOs = purchaseOrders.filter((po) => OPEN_PO_STATUSES.includes(po.status));
  const awaitingReceipt = purchaseOrders.filter((po) => AWAITING_RECEIPT_STATUSES.includes(po.status));
  const recentlyReceived = purchaseOrders.filter((po) => po.status === "RECEIVED").slice(0, 5);
  const activeShipments = shipments.filter((s) => ACTIVE_SHIPMENT_STATUSES.includes(s.status));
  const activeInboundShipments = activeShipments.filter((s) => s.direction === "INBOUND");
  const activeOutboundShipments = activeShipments.filter((s) => s.direction === "OUTBOUND");
  const openSalesOrders = salesOrders.filter((order) => OPEN_SALES_ORDER_STATUSES.includes(order.status));
  const awaitingAllocation = salesOrders.filter((order) => order.status === "CONFIRMED");
  const inventoryValue = stockLevels.reduce((sum, l) => sum + l.quantityOnHand * Number(l.product.costPrice), 0);
  const availableUnits = stockLevels.reduce((sum, l) => sum + Math.max(l.quantityOnHand - l.quantityReserved, 0), 0);
  const productsInStock = new Set(stockLevels.filter((l) => l.quantityOnHand > 0).map((l) => l.productId)).size;

  return (
    <>
      <PageHeader title="Dashboard" description="Inbound and outbound supply chain at a glance" />

      {hasPartialData && (
        <div className="mb-4">
          <ErrorState message="Some workflow data could not load. Inventory data is still shown below." />
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <MetricCard icon={ClipboardList} label="Open Purchase Orders" value={openPOs.length} href="/purchase-orders" />
        <MetricCard icon={ShoppingCart} label="Open Sales Orders" value={openSalesOrders.length} href="/sales-orders" />
        <MetricCard icon={PackageSearch} label="Awaiting Allocation" value={awaitingAllocation.length} href="/sales-orders?status=CONFIRMED" />
        <MetricCard icon={Truck} label="Inbound Shipments" value={activeInboundShipments.length} href="/shipments?direction=INBOUND" />
        <MetricCard icon={Truck} label="Outbound Shipments" value={activeOutboundShipments.length} href="/shipments?direction=OUTBOUND" />
        <MetricCard icon={Coins} label="Inventory Value" value={`฿${formatNumber(inventoryValue)}`} href="/inventory" />
        <MetricCard icon={Boxes} label="Products In Stock" value={productsInStock} href="/inventory" />
        <MetricCard icon={Boxes} label="Available Units" value={formatNumber(availableUnits)} href="/inventory" />
        <MetricCard icon={PackageCheck} label="Recently Received" value={recentlyReceived.length} href="/purchase-orders?status=RECEIVED" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>POs awaiting receipt</CardTitle>
          </CardHeader>
          {awaitingReceipt.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nothing awaiting receipt" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>PO</Th>
                  <Th>Supplier</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {awaitingReceipt.slice(0, 6).map((po) => (
                  <Tr key={po.id}>
                    <Td>
                      <Link href={`/purchase-orders/${po.id}`} className="font-medium text-accent hover:underline">
                        {po.poNumber}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{po.supplier?.name ?? "—"}</Td>
                    <Td>
                      <Badge tone={poStatusTone(po.status)}>{formatStatusLabel(po.status)}</Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recently received</CardTitle>
          </CardHeader>
          {recentlyReceived.length === 0 ? (
            <EmptyState icon={PackageCheck} title="Nothing received yet" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>PO</Th>
                  <Th>Supplier</Th>
                  <Th>Order date</Th>
                </Tr>
              </Thead>
              <Tbody>
                {recentlyReceived.map((po) => (
                  <Tr key={po.id}>
                    <Td>
                      <Link href={`/purchase-orders/${po.id}`} className="font-medium text-accent hover:underline">
                        {po.poNumber}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{po.supplier?.name ?? "—"}</Td>
                    <Td className="text-ink-soft">{formatDate(po.orderDate)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string | number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-border-strong">
        <CardBody className="flex items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
            <Icon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
            <p className="text-xl font-semibold text-ink">{value}</p>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
