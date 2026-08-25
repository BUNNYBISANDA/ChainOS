"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * `icon` is a pre-rendered element (`<Package className="size-4" />`), not
 * a component reference — a component/function passed as a prop from a
 * Server Component isn't serializable across the RSC boundary, but JSX
 * children/props built from it are, so the icon is rendered server-side
 * in AppLayout and handed down already-rendered.
 */
export function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent-subtle text-accent" : "text-ink-soft hover:bg-surface-subtle hover:text-ink",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
