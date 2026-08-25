"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import type { FormState } from "@/lib/actions/errors";
import type { Product } from "@/lib/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ProductForm({
  action,
  product,
  submitLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  product?: Product;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-xl space-y-4" noValidate>
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" defaultValue={product?.sku} placeholder="ELEC-001" required />
          <p className="mt-1 text-xs text-ink-faint">Human-readable, unique per organization — not the internal record id.</p>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" defaultValue={product?.category ?? ""} placeholder="Electronics" />
        </div>
      </div>

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={product?.name} placeholder="USB-C Adapter" required />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" defaultValue={product?.description ?? ""} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="uom">Unit of measure</Label>
          <Input id="uom" name="uom" defaultValue={product?.uom ?? "EACH"} required />
        </div>
        <div>
          <Label htmlFor="costPrice">Cost (THB)</Label>
          <Input id="costPrice" name="costPrice" type="number" step="0.01" min="0" defaultValue={product?.costPrice ?? "0"} required />
        </div>
        {product && (
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="active" defaultChecked={product.active} className="size-4 rounded border-border-strong" />
              Active
            </label>
          </div>
        )}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
