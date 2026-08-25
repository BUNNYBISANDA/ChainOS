"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";

/**
 * A button that calls a zero/single-arg server action directly (not a
 * form submission) and surfaces its `{ error? }` result inline — used for
 * one-click transitions (approve, cancel, book, dispatch, ...) where a
 * full form would be overkill.
 */
export function ActionButton({
  action,
  children,
  confirmMessage,
  ...buttonProps
}: {
  action: () => Promise<{ error?: string }>;
  children: React.ReactNode;
  confirmMessage?: string;
} & Omit<ButtonProps, "onClick" | "loading">) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <Button {...buttonProps} loading={pending} disabled={pending} onClick={onClick}>
        {children}
      </Button>
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
