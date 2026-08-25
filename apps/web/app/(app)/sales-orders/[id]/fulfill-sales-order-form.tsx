"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { fulfillSalesOrderAction } from "@/lib/actions/sales-orders";

interface FulfillableLine {
  salesOrderLineId: string;
  productLabel: string;
  remaining: number;
}

export function FulfillSalesOrderForm({ salesOrderId, lines }: { salesOrderId: string; lines: FulfillableLine[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.salesOrderLineId, String(line.remaining)])),
  );

  function submit() {
    setError(null);
    const payload = lines
      .map((line) => ({ salesOrderLineId: line.salesOrderLineId, qty: Number(quantities[line.salesOrderLineId] ?? 0) }))
      .filter((line) => line.qty > 0);

    if (payload.length === 0) {
      setError("Enter a fulfillment quantity greater than zero for at least one line.");
      return;
    }
    for (const line of payload) {
      const max = lines.find((l) => l.salesOrderLineId === line.salesOrderLineId)?.remaining ?? 0;
      if (line.qty > max) {
        setError(`Cannot fulfill more than the ${max} units still reserved on that line.`);
        return;
      }
    }

    startTransition(async () => {
      const result = await fulfillSalesOrderAction(salesOrderId, payload);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <Banner tone="danger">{error}</Banner>}
      <Table>
        <Thead>
          <Tr>
            <Th>Product</Th>
            <Th className="w-32 text-right">Remaining</Th>
            <Th className="w-36 text-right">Fulfill now</Th>
          </Tr>
        </Thead>
        <Tbody>
          {lines.map((line) => (
            <Tr key={line.salesOrderLineId}>
              <Td>{line.productLabel}</Td>
              <Td className="text-right">{line.remaining}</Td>
              <Td>
                <Label className="sr-only" htmlFor={`qty-${line.salesOrderLineId}`}>
                  Quantity to fulfill for {line.productLabel}
                </Label>
                <Input
                  id={`qty-${line.salesOrderLineId}`}
                  type="number"
                  min={0}
                  max={line.remaining}
                  step={1}
                  className="text-right"
                  value={quantities[line.salesOrderLineId] ?? ""}
                  onChange={(event) =>
                    setQuantities((prev) => ({ ...prev, [line.salesOrderLineId]: event.target.value }))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button loading={pending} disabled={pending} onClick={submit} variant="secondary">
        <PackageCheck className="size-4" /> Fulfill Selected Quantities
      </Button>
    </div>
  );
}
