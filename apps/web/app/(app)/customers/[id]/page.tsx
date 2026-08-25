import Link from "next/link";
import { notFound } from "next/navigation";
import { Edit, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Customer, SalesOrder } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { customerStatusTone, formatStatusLabel, salesOrderStatusTone } from "@/lib/status";
import { formatDate } from "@/lib/format";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let customers: Customer[];
  let orders: SalesOrder[];
  try {
    [customers, orders] = await Promise.all([apiGet<Customer[]>("/customers"), apiGet<SalesOrder[]>("/sales-orders")]);
  } catch {
    return <ErrorState message="Could not load this customer." />;
  }

  const customer = customers.find((item) => item.id === id);
  if (!customer) notFound();

  const customerOrders = orders.filter((order) => order.customerId === customer.id);
  const openOrders = customerOrders.filter((order) => !["FULFILLED", "CANCELLED"].includes(order.status)).length;
  const status = customer.status;

  return (
    <>
      <PageHeader
        title={customer.companyName}
        description={customer.email ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <ButtonLink href={`/sales-orders/new?customerId=${customer.id}`} variant="secondary">
              <Plus className="size-4" /> New Sales Order
            </ButtonLink>
            <ButtonLink href={`/customers/${customer.id}/edit`} variant="ghost">
              <Edit className="size-4" /> Edit
            </ButtonLink>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <Stat label="Status">
          <Badge tone={customerStatusTone(status)}>{formatStatusLabel(status)}</Badge>
        </Stat>
        <Stat label="Sales orders">{customerOrders.length.toLocaleString()}</Stat>
        <Stat label="Open orders">{openOrders.toLocaleString()}</Stat>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Company details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
              <Field label="Customer code">{customer.customerCode}</Field>
              <Field label="Company">{customer.companyName}</Field>
              <Field label="Created">{formatDate(customer.createdAt)}</Field>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact and location</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm max-sm:grid-cols-1">
              <Field label="Contact">{customer.contactName ?? "-"}</Field>
              <Field label="Email">{customer.email ?? "-"}</Field>
              <Field label="Phone">{customer.phone ?? "-"}</Field>
              <Field label="Location">{customer.city ?? customer.province ?? customer.country ?? "-"}</Field>
              <Field label="Address">{customer.address ?? "-"}</Field>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sales Orders</CardTitle>
        </CardHeader>
        {customerOrders.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-faint">No sales orders for this customer yet.</p>
          </CardBody>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Sales Order</Th>
                <Th>Created</Th>
                <Th>Status</Th>
                <Th className="text-right">Lines</Th>
              </Tr>
            </Thead>
            <Tbody>
              {customerOrders.slice(0, 8).map((order) => (
                <Tr key={order.id}>
                  <Td>
                    <Link href={`/sales-orders/${order.id}`} className="font-medium text-accent hover:underline">
                      {order.orderNumber}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{formatDate(order.createdAt)}</Td>
                  <Td>
                    <Badge tone={salesOrderStatusTone(order.status)}>{formatStatusLabel(order.status)}</Badge>
                  </Td>
                  <Td className="text-right">{order.lines.length}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
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
