import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — ChainOS" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">ChainOS</p>
          <h1 className="mt-1 text-lg font-semibold text-ink">Supply Chain Operating System</h1>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Dev credentials come from <code className="rounded bg-slate-100 px-1 py-0.5">pnpm db:seed</code>.
        </p>
      </div>
    </main>
  );
}
