import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { StockMovement } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ButtonLink } from "@/components/ui/button-link";
import { formatDateTime, formatNumber } from "@/lib/format";

const MOVEMENT_TONE = {
  RECEIPT: "success",
  FULFILLMENT: "info",
  ADJUSTMENT: "warning",
  TRANSFER: "neutral",
} as const;

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; warehouseId?: string }>;
}) {
  const { productId, warehouseId } = await searchParams;
  const query = new URLSearchParams();
  if (productId) query.set("productId", productId);
  if (warehouseId) query.set("warehouseId", warehouseId);

  let movements: StockMovement[];
  try {
    movements = await apiGet<StockMovement[]>(`/stock-movements${query.toString() ? `?${query}` : ""}`);
  } catch {
    return (
      <>
        <PageHeader title="Inventory Ledger" />
        <ErrorState message="Could not load the inventory ledger from the API." />
      </>
    );
  }

  const product = movements[0]?.product;
  const warehouse = movements[0]?.warehouse;
  const runningTotal = movements
    .slice()
    .reverse()
    .reduce<number[]>((acc, m) => {
      const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
      acc.push(prev + m.quantityDelta);
      return acc;
    }, []);
  runningTotal.reverse();

  return (
    <>
      <PageHeader
        title={product ? `${product.sku} — ${product.name}` : "Inventory Ledger"}
        description={warehouse ? `${warehouse.name} · immutable movement history` : "Immutable movement history"}
        action={
          <ButtonLink href="/inventory" variant="ghost">
            <ArrowLeft className="size-4" /> Back to Inventory
          </ButtonLink>
        }
      />

      <Card>
        {movements.length === 0 ? (
          <EmptyState icon={History} title="No movements recorded" description="This product/warehouse combination has no ledger entries yet." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th className="text-right">Quantity</Th>
                <Th className="text-right">Balance after</Th>
                <Th>Reference</Th>
              </Tr>
            </Thead>
            <Tbody>
              {movements.map((m, i) => (
                <Tr key={m.id}>
                  <Td className="text-ink-soft">{formatDateTime(m.createdAt)}</Td>
                  <Td>
                    <Badge tone={MOVEMENT_TONE[m.type]}>{m.type}</Badge>
                  </Td>
                  <Td className={`text-right font-medium ${m.quantityDelta >= 0 ? "text-success" : "text-danger"}`}>
                    {m.quantityDelta >= 0 ? "+" : ""}
                    {formatNumber(m.quantityDelta)}
                  </Td>
                  <Td className="text-right">{formatNumber(runningTotal[i])}</Td>
                  <Td className="text-ink-faint">
                    {m.salesOrderLineId ? (
                      <Link href="/sales-orders" className="hover:underline">
                        Sales order fulfillment
                      </Link>
                    ) : m.purchaseOrderLineId ? (
                      <Link href={`/purchase-orders`} className="hover:underline">
                        PO receipt
                      </Link>
                    ) : (
                      m.note || "—"
                    )}
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
