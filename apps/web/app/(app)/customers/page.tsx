import Link from "next/link";
import { Contact, Plus } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Customer, CustomerOrder } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { customerStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDate } from "@/lib/format";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  let customers: Customer[];
  let orders: CustomerOrder[];
  try {
    [customers, orders] = await Promise.all([apiGet<Customer[]>("/customers"), apiGet<CustomerOrder[]>("/customer-orders")]);
  } catch {
    return (
      <>
        <PageHeader title="Customers" />
        <ErrorState message="Could not load customers from the API." />
      </>
    );
  }

  const search = params.search?.trim().toLowerCase() ?? "";
  const status = params.status ?? "";
  const filtered = customers.filter((customer) => {
    const code = customer.code ?? customer.id.slice(0, 8);
    const statusValue = customer.status ?? "ACTIVE";
    const matchesSearch = !search || `${code} ${customer.name} ${customer.email ?? ""}`.toLowerCase().includes(search);
    const matchesStatus = !status || statusValue === status;
    return matchesSearch && matchesStatus;
  });
  const hasFilters = Boolean(search || status);

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${filtered.length} customer${filtered.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/customers/new">
            <Plus className="size-4" /> New Customer
          </ButtonLink>
        }
      />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-64">
            <Label htmlFor="search">Search</Label>
            <Input id="search" name="search" defaultValue={params.search ?? ""} placeholder="Code, company, or email" />
          </div>
          <div className="w-44">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={status}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLOCKED">Blocked</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {hasFilters && (
            <ButtonLink href="/customers" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={hasFilters ? "No customers match these filters" : "No customers yet"}
            description={hasFilters ? "Try broadening your filters." : "Add your first customer to start creating sales orders."}
            action={
              !hasFilters && (
                <ButtonLink href="/customers/new" size="sm">
                  <Plus className="size-4" /> New Customer
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Customer Code</Th>
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th>Location</Th>
                <Th>Status</Th>
                <Th className="text-right">Orders</Th>
                <Th>Created</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((customer) => {
                const orderCount = orders.filter((order) => order.customerId === customer.id).length;
                const statusValue = customer.status ?? "ACTIVE";
                return (
                  <Tr key={customer.id}>
                    <Td className="font-mono text-xs text-ink-soft">{customer.code ?? customer.id.slice(0, 8)}</Td>
                    <Td>
                      <Link href={`/customers/${customer.id}`} className="font-medium text-accent hover:underline">
                        {customer.name}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{customer.contactName ?? customer.email ?? "-"}</Td>
                    <Td className="text-ink-soft">{customer.city ?? customer.province ?? customer.country ?? "-"}</Td>
                    <Td>
                      <Badge tone={customerStatusTone(statusValue)}>{formatStatusLabel(statusValue)}</Badge>
                    </Td>
                    <Td className="text-right">{orderCount.toLocaleString()}</Td>
                    <Td className="text-ink-soft">{formatDate(customer.createdAt)}</Td>
                    <Td>
                      <Link href={`/customers/${customer.id}`} className="text-sm font-medium text-accent hover:underline">
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
