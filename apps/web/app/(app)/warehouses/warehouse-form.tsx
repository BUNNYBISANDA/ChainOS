"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import type { FormState } from "@/lib/actions/errors";
import type { Warehouse } from "@/lib/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function WarehouseForm({
  action,
  warehouse,
  submitLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  warehouse?: Warehouse;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="code">Warehouse code</Label>
          <Input id="code" name="code" defaultValue={warehouse?.code} placeholder="BKK-DC-01" required />
        </div>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={warehouse?.name} placeholder="Bangkok Distribution Center" required />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={warehouse?.address ?? ""} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="province">Province</Label>
          <Input id="province" name="province" defaultValue={warehouse?.province ?? ""} placeholder="Bangkok" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={warehouse?.country ?? ""} placeholder="Thailand" />
        </div>
        {warehouse && (
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={warehouse.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </div>
        )}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
