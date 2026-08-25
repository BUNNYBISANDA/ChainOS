import Link from "next/link";
import { Plus, Package } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Product } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatNumber } from "@/lib/format";

export default async function ProductsPage() {
  let products: Product[];
  try {
    products = await apiGet<Product[]>("/products");
  } catch {
    return (
      <>
        <PageHeader title="Products" />
        <ErrorState message="Could not load products from the API." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Products"
        description={`${products.length} product${products.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/products/new">
            <Plus className="size-4" /> New Product
          </ButtonLink>
        }
      />

      <Card>
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add your first product to start building purchase orders."
            action={
              <ButtonLink href="/products/new" size="sm">
                <Plus className="size-4" /> New Product
              </ButtonLink>
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>SKU</Th>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th>UoM</Th>
                <Th>Cost</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {products.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono text-xs text-ink-soft">{p.sku}</Td>
                  <Td>
                    <Link href={`/products/${p.id}`} className="font-medium text-accent hover:underline">
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{p.category ?? "—"}</Td>
                  <Td className="text-ink-soft">{p.uom}</Td>
                  <Td className="text-ink-soft">฿{formatNumber(Number(p.costPrice))}</Td>
                  <Td>
                    <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
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
