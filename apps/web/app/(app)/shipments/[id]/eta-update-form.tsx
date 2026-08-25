"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Clock } from "lucide-react";
import { updateShipmentEtaAction } from "@/lib/actions/shipments";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending} size="sm">
      <Clock className="size-4" /> {pending ? "Updating..." : "Update ETA"}
    </Button>
  );
}

export function EtaUpdateForm({ shipmentId }: { shipmentId: string }) {
  const [state, formAction] = useActionState(updateShipmentEtaAction.bind(null, shipmentId), {});

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div>
        <Label htmlFor="estimatedArrivalAt">New ETA</Label>
        <Input id="estimatedArrivalAt" name="estimatedArrivalAt" type="datetime-local" required />
      </div>
      <div>
        <Label htmlFor="notes">Reason / notes</Label>
        <Input id="notes" name="notes" placeholder="Optional" />
      </div>
      <SubmitButton />
    </form>
  );
}
