import { AlertTriangle } from "lucide-react";

/** Used for real failures (failed fetch, 5xx) — distinct from EmptyState (zero rows is not an error). */
export function ErrorState({ title = "Something went wrong", message }: { title?: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/20 bg-danger-subtle px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <p className="text-sm font-medium text-danger">{title}</p>
      {message && <p className="max-w-sm text-sm text-danger/80">{message}</p>}
    </div>
  );
}
