import Link from "next/link";
import { Plus, ClipboardList } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PurchaseOrder, Supplier, Warehouse, PurchaseOrderStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { poStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDate, formatMoney } from "@/lib/format";

const STATUSES: PurchaseOrderStatus[] = ["DRAFT", "APPROVED", "SHIPPED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.supplierId) query.set("supplierId", params.supplierId);
  if (params.warehouseId) query.set("warehouseId", params.warehouseId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  let orders: PurchaseOrder[];
  let suppliers: Supplier[];
  let warehouses: Warehouse[];
  try {
    [orders, suppliers, warehouses] = await Promise.all([
      apiGet<PurchaseOrder[]>(`/purchase-orders${query.toString() ? `?${query}` : ""}`),
      apiGet<Supplier[]>("/suppliers"),
      apiGet<Warehouse[]>("/warehouses"),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Purchase Orders" />
        <ErrorState message="Could not load purchase orders from the API." />
      </>
    );
  }

  const hasFilters = Boolean(params.status || params.supplierId || params.warehouseId || params.from || params.to);

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/purchase-orders/new">
            <Plus className="size-4" /> New Purchase Order
          </ButtonLink>
        }
      />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-40">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={params.status ?? ""}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatusLabel(s)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <Label htmlFor="supplierId">Supplier</Label>
            <Select id="supplierId" name="supplierId" defaultValue={params.supplierId ?? ""}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <Label htmlFor="warehouseId">Warehouse</Label>
            <Select id="warehouseId" name="warehouseId" defaultValue={params.warehouseId ?? ""}>
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
          </div>
          <div className="w-36">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
          </div>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {hasFilters && (
            <ButtonLink href="/purchase-orders" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasFilters ? "No purchase orders match these filters" : "No purchase orders yet"}
            description={hasFilters ? "Try broadening your filters." : "Create your first purchase order to start the inbound flow."}
            action={
              !hasFilters && (
                <ButtonLink href="/purchase-orders/new" size="sm">
                  <Plus className="size-4" /> New Purchase Order
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>PO</Th>
                <Th>Supplier</Th>
                <Th>Warehouse</Th>
                <Th>Order Date</Th>
                <Th>Expected</Th>
                <Th className="text-right">Value</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {orders.map((po) => (
                <Tr key={po.id}>
                  <Td>
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium text-accent hover:underline">
                      {po.poNumber}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{po.supplier?.name ?? "—"}</Td>
                  <Td className="text-ink-soft">{po.warehouse?.name ?? "—"}</Td>
                  <Td className="text-ink-soft">{formatDate(po.orderDate)}</Td>
                  <Td className="text-ink-soft">{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : "—"}</Td>
                  <Td className="text-right">
                    {formatMoney(po.currency, po.lines.reduce((sum, l) => sum + l.qtyOrdered * Number(l.unitCost), 0))}
                  </Td>
                  <Td>
                    <Badge tone={poStatusTone(po.status)}>{formatStatusLabel(po.status)}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/purchase-orders/${po.id}`} className="text-sm font-medium text-accent hover:underline">
                      View
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
