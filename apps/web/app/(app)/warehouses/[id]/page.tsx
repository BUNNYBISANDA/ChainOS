import { notFound } from "next/navigation";
import { Pencil, Boxes } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { Warehouse, StockLevel } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { warehouseStatusTone } from "@/lib/status";
import { formatNumber } from "@/lib/format";

export default async function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let warehouse: Warehouse;
  let stockLevels: StockLevel[];
  try {
    [warehouse, stockLevels] = await Promise.all([
      apiGet<Warehouse>(`/warehouses/${id}`),
      apiGet<StockLevel[]>(`/stock-levels?warehouseId=${id}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this warehouse." />;
  }

  return (
    <>
      <PageHeader
        title={warehouse.name}
        description={warehouse.code}
        action={
          <ButtonLink href={`/warehouses/${warehouse.id}/edit`} variant="secondary">
            <Pencil className="size-4" /> Edit
          </ButtonLink>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Field label="Address" value={warehouse.address} />
            <Field label="Province" value={warehouse.province} />
            <Field label="Country" value={warehouse.country} />
            <div>
              <dt className="text-xs text-ink-faint">Status</dt>
              <dd className="mt-1">
                <Badge tone={warehouseStatusTone(warehouse.status)}>{warehouse.status}</Badge>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock at this warehouse</CardTitle>
        </CardHeader>
        {stockLevels.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock at this warehouse yet" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
              </Tr>
            </Thead>
            <Tbody>
              {stockLevels.map((level) => (
                <Tr key={level.id}>
                  <Td className="font-mono text-xs text-ink-soft">{level.product.sku}</Td>
                  <Td>{level.product.name}</Td>
                  <Td className="text-right">{formatNumber(level.quantityOnHand)}</Td>
                  <Td className="text-right">{formatNumber(level.quantityReserved)}</Td>
                  <Td className="text-right font-medium">{formatNumber(level.quantityOnHand - level.quantityReserved)}</Td>
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
