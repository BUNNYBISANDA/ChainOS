import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-ink placeholder:text-ink-faint",
        "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
        "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint",
        "aria-invalid:border-danger aria-invalid:ring-danger",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
