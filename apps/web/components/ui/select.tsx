import { SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-9 w-full appearance-none rounded-md border border-border-strong bg-white pl-3 pr-8 text-sm text-ink",
          "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
          "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
    </div>
  ),
);
Select.displayName = "Select";
