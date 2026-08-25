"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { createInboundShipmentAction } from "@/lib/actions/shipments";

export function CreateShipmentButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await createInboundShipmentAction(purchaseOrderId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/shipments/${result.id}`);
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <Button variant="secondary" loading={pending} disabled={pending} onClick={onClick}>
        <Truck className="size-4" /> Create Inbound Shipment
      </Button>
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
