"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import type { FormState } from "@/lib/actions/errors";
import type { Customer } from "@/lib/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

export function CustomerForm({
  action,
  customer,
  submitLabel,
  editable = true,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  customer?: Customer;
  submitLabel: string;
  editable?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const disabled = !editable;

  return (
    <form action={formAction} className="max-w-3xl space-y-4" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {!editable && <Banner tone="warning">Customer editing needs the Phase 2 backend update endpoint before changes can be saved.</Banner>}

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="name">Company name</Label>
          <Input id="name" name="name" defaultValue={customer?.name ?? customer?.companyName ?? ""} required disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="contactName">Contact name</Label>
          <Input id="contactName" name="contactName" defaultValue={customer?.contactName ?? ""} disabled placeholder="Backend pending" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} disabled={disabled} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} disabled placeholder="Backend pending" />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={customer?.address ?? ""} disabled placeholder="Backend pending" />
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="city">City / province</Label>
          <Input id="city" name="city" defaultValue={customer?.city ?? customer?.province ?? ""} disabled placeholder="Backend pending" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={customer?.country ?? ""} disabled placeholder="Backend pending" />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={customer?.status ?? "ACTIVE"} disabled>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
        </div>
      </div>

      {editable && <SubmitButton label={submitLabel} />}
    </form>
  );
}
