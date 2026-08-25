"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { createPurchaseOrderAction } from "@/lib/actions/purchase-orders";
import type { Product, Supplier, Warehouse } from "@/lib/types";

interface Line {
  key: number;
  productId: string;
  qtyOrdered: string;
  unitCost: string;
}

let nextKey = 1;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      {pending ? "Creating…" : "Create Purchase Order"}
    </Button>
  );
}

export function PurchaseOrderForm({
  suppliers,
  warehouses,
  products,
}: {
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
}) {
  const [state, formAction] = useActionState(createPurchaseOrderAction, {});
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, productId: "", qtyOrdered: "", unitCost: "" }]);

  function addLine() {
    setLines((prev) => [...prev, { key: nextKey++, productId: "", qtyOrdered: "", unitCost: "" }]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onProductChange(key: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(key, { productId, unitCost: product ? product.costPrice : "" });
  }

  const linesJson = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((l) => l.productId && Number(l.qtyOrdered) > 0)
          .map((l) => ({ productId: l.productId, qtyOrdered: Number(l.qtyOrdered), unitCost: Number(l.unitCost) || 0 })),
      ),
    [lines],
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid max-w-2xl grid-cols-2 gap-4">
        <div>
          <Label htmlFor="supplierId">Supplier</Label>
          <Select id="supplierId" name="supplierId" required defaultValue="">
            <option value="" disabled>
              Select a supplier
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="warehouseId">Destination warehouse</Label>
          <Select id="warehouseId" name="warehouseId" required defaultValue="">
            <option value="" disabled>
              Select a warehouse
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" defaultValue="THB" required />
        </div>
        <div>
          <Label htmlFor="expectedDeliveryDate">Expected delivery date</Label>
          <Input id="expectedDeliveryDate" name="expectedDeliveryDate" type="date" />
        </div>
        <div className="col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" placeholder="Optional" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="mb-0">Products</Label>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            <Plus className="size-3.5" /> Add product
          </Button>
        </div>
        <Table>
          <Thead>
            <Tr>
              <Th>Product</Th>
              <Th className="w-32 text-right">Quantity</Th>
              <Th className="w-32 text-right">Unit cost</Th>
              <Th className="w-32 text-right">Line total</Th>
              <Th className="w-10" />
            </Tr>
          </Thead>
          <Tbody>
            {lines.map((line) => {
              const total = (Number(line.qtyOrdered) || 0) * (Number(line.unitCost) || 0);
              return (
                <Tr key={line.key}>
                  <Td>
                    <Select value={line.productId} onChange={(e) => onProductChange(line.key, e.target.value)}>
                      <option value="">Select a product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={line.qtyOrdered}
                      onChange={(e) => updateLine(line.key, { qtyOrdered: e.target.value })}
                      className="text-right"
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                      className="text-right"
                    />
                  </Td>
                  <Td className="text-right font-medium">{total.toLocaleString()}</Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-ink-faint hover:text-danger"
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </div>

      <input type="hidden" name="linesJson" value={linesJson} />
      <SubmitButton />
    </form>
  );
}
