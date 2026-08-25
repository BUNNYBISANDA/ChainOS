import { notFound } from "next/navigation";
import { Pencil, Boxes } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { Product, StockLevel } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatNumber } from "@/lib/format";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product: Product;
  let stockLevels: StockLevel[];
  try {
    [product, stockLevels] = await Promise.all([
      apiGet<Product>(`/products/${id}`),
      apiGet<StockLevel[]>(`/stock-levels?productId=${id}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this product." />;
  }

  return (
    <>
      <PageHeader
        title={product.name}
        description={product.sku}
        action={
          <ButtonLink href={`/products/${product.id}/edit`} variant="secondary">
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
            <Field label="Category" value={product.category} />
            <Field label="Unit of measure" value={product.uom} />
            <Field label="Cost" value={`฿${formatNumber(Number(product.costPrice))}`} />
            <Field label="Description" value={product.description} />
            <div>
              <dt className="text-xs text-ink-faint">Status</dt>
              <dd className="mt-1">
                <Badge tone={product.active ? "success" : "neutral"}>{product.active ? "Active" : "Inactive"}</Badge>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock by warehouse</CardTitle>
        </CardHeader>
        {stockLevels.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock recorded yet" description="Stock appears here once a purchase order is received." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Warehouse</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
              </Tr>
            </Thead>
            <Tbody>
              {stockLevels.map((level) => (
                <Tr key={level.id}>
                  <Td>{level.warehouse.name}</Td>
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
