import Link from "next/link";
import { Boxes } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { StockLevel, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { formatNumber } from "@/lib/format";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.warehouseId) query.set("warehouseId", params.warehouseId);

  let levels: StockLevel[];
  let warehouses: Warehouse[];
  try {
    [levels, warehouses] = await Promise.all([
      apiGet<StockLevel[]>(`/stock-levels${query.toString() ? `?${query}` : ""}`),
      apiGet<Warehouse[]>("/warehouses"),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Inventory" />
        <ErrorState message="Could not load inventory from the API." />
      </>
    );
  }

  const totalValue = levels.reduce((sum, l) => sum + l.quantityOnHand * Number(l.product.costPrice), 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${levels.length} stock line${levels.length === 1 ? "" : "s"} · ฿${formatNumber(totalValue)} on hand`}
        action={
          <ButtonLink href="/inventory/risk" variant="secondary">
            View Inventory Risk
          </ButtonLink>
        }
      />

      <Card className="mb-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="w-56">
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
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {params.warehouseId && (
            <ButtonLink href="/inventory" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      <Card>
        {levels.length === 0 ? (
          <EmptyState icon={Boxes} title="No inventory yet" description="Stock appears here once a purchase order is received." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Warehouse</Th>
                <Th className="text-right">On Hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
              </Tr>
            </Thead>
            <Tbody>
              {levels.map((level) => {
                const available = level.quantityOnHand - level.quantityReserved;
                return (
                <Tr key={level.id} className={available === 0 ? "bg-warning/5" : undefined}>
                  <Td className="font-mono text-xs text-ink-soft">{level.product.sku}</Td>
                  <Td>
                    <Link
                      href={`/inventory/ledger?productId=${level.productId}&warehouseId=${level.warehouseId}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {level.product.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{level.warehouse.name}</Td>
                  <Td className="text-right">{formatNumber(level.quantityOnHand)}</Td>
                  <Td className="text-right">{formatNumber(level.quantityReserved)}</Td>
                  <Td className={`text-right font-medium ${available === 0 ? "text-warning" : ""}`}>{formatNumber(available)}</Td>
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
