"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import type { FormState } from "@/lib/actions/errors";
import type { Supplier } from "@/lib/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function SupplierForm({
  action,
  supplier,
  submitLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  supplier?: Supplier;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="code">Supplier code</Label>
          <Input id="code" name="code" defaultValue={supplier?.code} placeholder="SUP-001" required />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={supplier?.country ?? ""} placeholder="China" />
        </div>
      </div>

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={supplier?.name} placeholder="Shenzhen Components Ltd." required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="contactName">Contact name</Label>
          <Input id="contactName" name="contactName" defaultValue={supplier?.contactName ?? ""} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} />
        </div>
        {supplier && (
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={supplier.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLOCKED">Blocked</option>
            </Select>
          </div>
        )}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
