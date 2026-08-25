import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Inline, persistent feedback — not a toast. Used both for server-action
 * validation errors (rendered next to the form that failed) and for
 * post-redirect success confirmations (`?success=...`), so an important
 * failure is never something the user could miss by looking away for a
 * second (see phase 1 UX-states requirement).
 */
export function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3.5 py-2.5 text-sm",
        tone === "success" && "border-success/20 bg-success-subtle text-success",
        tone === "danger" && "border-danger/20 bg-danger-subtle text-danger",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
