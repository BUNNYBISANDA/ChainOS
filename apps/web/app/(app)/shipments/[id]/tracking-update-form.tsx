"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MapPinPlus } from "lucide-react";
import { addShipmentTrackingEventAction } from "@/lib/actions/shipments";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const EVENT_TYPES = ["LOCATION_UPDATED", "IN_TRANSIT", "NOTE_ADDED", "DELAYED"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending} size="sm">
      <MapPinPlus className="size-4" /> {pending ? "Adding..." : "Add Tracking Update"}
    </Button>
  );
}

export function TrackingUpdateForm({ shipmentId }: { shipmentId: string }) {
  const [state, formAction] = useActionState(addShipmentTrackingEventAction.bind(null, shipmentId), {});

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div>
          <Label htmlFor="eventType">Event type</Label>
          <Select id="eventType" name="eventType" defaultValue="LOCATION_UPDATED" required>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="eventTimestamp">Timestamp</Label>
          <Input id="eventTimestamp" name="eventTimestamp" type="datetime-local" />
        </div>
      </div>
      <div>
        <Label htmlFor="locationName">Location</Label>
        <Input id="locationName" name="locationName" placeholder="Laem Chabang Port" />
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div>
          <Label htmlFor="latitude">Latitude</Label>
          <Input id="latitude" name="latitude" inputMode="decimal" placeholder="13.0827" />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude</Label>
          <Input id="longitude" name="longitude" inputMode="decimal" placeholder="100.8831" />
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" placeholder="Container cleared terminal gate." />
      </div>
      <SubmitButton />
    </form>
  );
}
