import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Customer, CustomerOrder, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { formatStatusLabel, salesOrderStatusTone } from "@/lib/status";
import { salesOrderNumber, salesOrderStatus, salesOrderTotal } from "@/lib/sales-orders";

const STATUSES = ["DRAFT", "ALLOCATED", "FULFILLED", "SHIPPED", "DELIVERED", "CANCELLED"];

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  let orders: CustomerOrder[];
  let customers: Customer[];
  let warehouses: Warehouse[];
  try {
    [orders, customers, warehouses] = await Promise.all([
      apiGet<CustomerOrder[]>("/customer-orders"),
      apiGet<Customer[]>("/customers"),
      apiGet<Warehouse[]>("/warehouses"),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Sales Orders" />
        <ErrorState message="Could not load sales orders from the API." />
      </>
    );
  }

  const filtered = orders.filter((order) => {
    const status = salesOrderStatus(order);
    return (
      (!params.status || status === params.status || order.status === params.status) &&
      (!params.customerId || order.customerId === params.customerId) &&
      (!params.warehouseId || order.warehouseId === params.warehouseId)
    );
  });
  const hasFilters = Boolean(params.status || params.customerId || params.warehouseId);

  return (
    <>
      <PageHeader
        title="Sales Orders"
        description={`${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/sales-orders/new">
            <Plus className="size-4" /> New Sales Order
          </ButtonLink>
        }
      />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-44">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={params.status ?? ""}>
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-52">
            <Label htmlFor="customerId">Customer</Label>
            <Select id="customerId" name="customerId" defaultValue={params.customerId ?? ""}>
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-52">
            <Label htmlFor="warehouseId">Warehouse</Label>
            <Select id="warehouseId" name="warehouseId" defaultValue={params.warehouseId ?? ""}>
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {hasFilters && (
            <ButtonLink href="/sales-orders" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={hasFilters ? "No sales orders match these filters" : "No sales orders yet"}
            description={hasFilters ? "Try broadening your filters." : "Create your first sales order to start the outbound flow."}
            action={
              !hasFilters && (
                <ButtonLink href="/sales-orders/new" size="sm">
                  <Plus className="size-4" /> New Sales Order
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Sales Order</Th>
                <Th>Customer</Th>
                <Th>Warehouse</Th>
                <Th>Order Date</Th>
                <Th>Requested Delivery</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((order) => {
                const customer = order.customer ?? customers.find((item) => item.id === order.customerId);
                const warehouse = order.warehouse ?? warehouses.find((item) => item.id === order.warehouseId);
                const status = salesOrderStatus(order);
                return (
                  <Tr key={order.id}>
                    <Td>
                      <Link href={`/sales-orders/${order.id}`} className="font-medium text-accent hover:underline">
                        {salesOrderNumber(order)}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{customer?.name ?? "-"}</Td>
                    <Td className="text-ink-soft">{warehouse?.name ?? "-"}</Td>
                    <Td className="text-ink-soft">{formatDate(order.orderDate ?? order.createdAt)}</Td>
                    <Td className="text-ink-soft">
                      {order.requestedDeliveryDate ? formatDate(order.requestedDeliveryDate) : "Backend pending"}
                    </Td>
                    <Td className="text-right">{formatMoney(order.currency ?? "THB", salesOrderTotal(order))}</Td>
                    <Td>
                      <Badge tone={salesOrderStatusTone(status)}>{formatStatusLabel(status)}</Badge>
                    </Td>
                    <Td>
                      <Link href={`/sales-orders/${order.id}`} className="text-sm font-medium text-accent hover:underline">
                        View
                      </Link>
                    </Td>
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
