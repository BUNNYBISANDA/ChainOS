"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { createOutboundShipmentAction } from "@/lib/actions/shipments";

export function CreateOutboundShipmentButton({ salesOrderId }: { salesOrderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <Button
        loading={pending}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await createOutboundShipmentAction(salesOrderId);
            if (result.error) setError(result.error);
            if (result.id) router.push(`/shipments/${result.id}`);
          });
        }}
      >
        <Truck className="size-4" /> Create Outbound Shipment
      </Button>
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
