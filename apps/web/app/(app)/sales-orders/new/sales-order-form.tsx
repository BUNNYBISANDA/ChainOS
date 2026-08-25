"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { createSalesOrderAction } from "@/lib/actions/sales-orders";
import type { Customer, Product, Warehouse } from "@/lib/types";
import { formatMoney } from "@/lib/format";

interface Line {
  key: number;
  productId: string;
  qtyOrdered: string;
  unitPrice: string;
}

let nextKey = 1;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      {pending ? "Creating..." : "Create Sales Order"}
    </Button>
  );
}

export function SalesOrderForm({
  customers,
  warehouses,
  products,
  defaultCustomerId,
}: {
  customers: Customer[];
  warehouses: Warehouse[];
  products: Product[];
  defaultCustomerId?: string;
}) {
  const [state, formAction] = useActionState(createSalesOrderAction, {});
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, productId: "", qtyOrdered: "", unitPrice: "" }]);

  function addLine() {
    setLines((prev) => [...prev, { key: nextKey++, productId: "", qtyOrdered: "", unitPrice: "" }]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  const duplicateProducts = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const line of lines) {
      if (!line.productId) continue;
      if (seen.has(line.productId)) duplicates.add(line.productId);
      seen.add(line.productId);
    }
    return duplicates;
  }, [lines]);

  const linesJson = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.productId && Number(line.qtyOrdered) > 0)
          .map((line) => ({ productId: line.productId, qtyOrdered: Number(line.qtyOrdered), unitPrice: Number(line.unitPrice) || 0 })),
      ),
    [lines],
  );

  const total = lines.reduce((sum, line) => sum + (Number(line.qtyOrdered) || 0) * (Number(line.unitPrice) || 0), 0);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {duplicateProducts.size > 0 && <Banner tone="danger">Duplicate product lines are not allowed.</Banner>}

      <div className="grid max-w-3xl grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="customerId">Customer</Label>
          <Select id="customerId" name="customerId" required defaultValue={defaultCustomerId ?? ""}>
            <option value="" disabled>
              Select a customer
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.companyName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="warehouseId">Warehouse</Label>
          <Select id="warehouseId" name="warehouseId" required defaultValue="">
            <option value="" disabled>
              Select a warehouse
            </option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="requestedDeliveryDate">Requested delivery</Label>
          <Input id="requestedDeliveryDate" name="requestedDeliveryDate" type="date" />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" defaultValue="THB" />
        </div>
        <div className="col-span-2 max-md:col-span-1">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" placeholder="Optional" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="mb-0">Line items</Label>
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            <Plus className="size-3.5" /> Add line
          </Button>
        </div>
        <Table>
          <Thead>
            <Tr>
              <Th>Product</Th>
              <Th className="w-32 text-right">Quantity</Th>
              <Th className="w-36 text-right">Unit price</Th>
              <Th className="w-36 text-right">Line total</Th>
              <Th className="w-10" />
            </Tr>
          </Thead>
          <Tbody>
            {lines.map((line) => {
              const lineTotal = (Number(line.qtyOrdered) || 0) * (Number(line.unitPrice) || 0);
              const duplicate = line.productId && duplicateProducts.has(line.productId);
              return (
                <Tr key={line.key}>
                  <Td>
                    <Select value={line.productId} onChange={(event) => updateLine(line.key, { productId: event.target.value })}>
                      <option value="">Select a product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} - {product.name}
                        </option>
                      ))}
                    </Select>
                    {duplicate && <p className="mt-1 text-xs text-danger">Duplicate product</p>}
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={line.qtyOrdered}
                      onChange={(event) => updateLine(line.key, { qtyOrdered: event.target.value })}
                      className="text-right"
                    />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                      className="text-right"
                      aria-label="Unit price"
                    />
                  </Td>
                  <Td className="text-right font-medium">{formatMoney("THB", lineTotal)}</Td>
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

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm text-ink-faint">Subtotal</p>
          <p className="text-xl font-semibold text-ink">{formatMoney("THB", total)}</p>
        </div>
        <SubmitButton />
      </div>

      <input type="hidden" name="linesJson" value={linesJson} />
    </form>
  );
}
