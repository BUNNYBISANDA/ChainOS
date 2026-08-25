"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { receivePurchaseOrderAction } from "@/lib/actions/purchase-orders";
import type { PurchaseOrderLine } from "@/lib/types";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending || disabled}>
      {pending ? "Receiving…" : "Record Receipt"}
    </Button>
  );
}

export function ReceiveForm({ purchaseOrderId, lines }: { purchaseOrderId: string; lines: PurchaseOrderLine[] }) {
  const action = receivePurchaseOrderAction.bind(null, purchaseOrderId);
  const [state, formAction] = useActionState(action, {});
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const linesJson = useMemo(() => {
    return JSON.stringify(
      lines.map((line) => ({
        purchaseOrderLineId: line.id,
        qtyReceived: Math.max(0, Math.min(Number(quantities[line.id] ?? 0) || 0, line.remaining ?? 0)),
      })),
    );
  }, [quantities, lines]);

  const anyQuantityEntered = Object.values(quantities).some((v) => Number(v) > 0);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <Table>
        <Thead>
          <Tr>
            <Th>Product</Th>
            <Th className="text-right">Ordered</Th>
            <Th className="text-right">Previously Received</Th>
            <Th className="text-right">Receiving Now</Th>
            <Th className="text-right">Remaining</Th>
          </Tr>
        </Thead>
        <Tbody>
          {lines.map((line) => {
            const remaining = line.remaining ?? line.qtyOrdered - line.qtyReceived;
            return (
              <Tr key={line.id}>
                <Td>
                  <span className="font-mono text-xs text-ink-soft">{line.product?.sku}</span> {line.product?.name}
                </Td>
                <Td className="text-right">{line.qtyOrdered.toLocaleString()}</Td>
                <Td className="text-right">{line.qtyReceived.toLocaleString()}</Td>
                <Td className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step={1}
                    disabled={remaining === 0}
                    value={quantities[line.id] ?? ""}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    className="ml-auto h-8 w-24 text-right"
                    placeholder="0"
                  />
                </Td>
                <Td className="text-right font-medium">{remaining.toLocaleString()}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      <input type="hidden" name="linesJson" value={linesJson} />
      <SubmitButton disabled={!anyQuantityEntered} />
    </form>
  );
}
