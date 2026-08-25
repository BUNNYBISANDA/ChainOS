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
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  customer?: Customer;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-3xl space-y-4" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="companyName">Company name</Label>
          <Input id="companyName" name="companyName" defaultValue={customer?.companyName ?? ""} required />
        </div>
        <div>
          <Label htmlFor="contactName">Contact name</Label>
          <Input id="contactName" name="contactName" defaultValue={customer?.contactName ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
        </div>
      </div>

      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
        </div>
        <div>
          <Label htmlFor="province">Province</Label>
          <Input id="province" name="province" defaultValue={customer?.province ?? ""} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={customer?.country ?? ""} />
        </div>
      </div>

      {customer && (
        <div className="max-w-xs">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={customer.status}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="BLOCKED">Blocked</option>
          </Select>
        </div>
      )}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
