import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ClipboardList } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { SupplierDetail } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { poStatusTone, supplierStatusTone, formatStatusLabel } from "@/lib/status";
import { formatDate, formatMoney } from "@/lib/format";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supplier: SupplierDetail;
  try {
    supplier = await apiGet<SupplierDetail>(`/suppliers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this supplier." />;
  }

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={supplier.code}
        action={
          <ButtonLink href={`/suppliers/${supplier.id}/edit`} variant="secondary">
            <Pencil className="size-4" /> Edit
          </ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Status</p>
            <Badge tone={supplierStatusTone(supplier.status)} className="mt-2">
              {supplier.status}
            </Badge>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Outstanding value</p>
            <p className="mt-1 text-xl font-semibold text-ink">{formatMoney("THB", supplier.outstandingValue)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Historical orders</p>
            <p className="mt-1 text-xl font-semibold text-ink">{supplier.orderCount}</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="Country" value={supplier.country} />
            <Field label="Contact" value={supplier.contactName} />
            <Field label="Email" value={supplier.email} />
            <Field label="Phone" value={supplier.phone} />
            <Field label="Created" value={formatDate(supplier.createdAt)} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
        </CardHeader>
        {supplier.purchaseOrders.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No purchase orders yet" description="Create one from the Purchase Orders page." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>PO</Th>
                <Th>Order date</Th>
                <Th>Value</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {supplier.purchaseOrders.map((po) => (
                <Tr key={po.id}>
                  <Td>
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium text-accent hover:underline">
                      {po.poNumber}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{formatDate(po.orderDate)}</Td>
                  <Td>{formatMoney(po.currency, po.totalValue)}</Td>
                  <Td>
                    <Badge tone={poStatusTone(po.status)}>{formatStatusLabel(po.status)}</Badge>
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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}
