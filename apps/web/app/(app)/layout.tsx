import { redirect } from "next/navigation";
import {
  Boxes,
  Building2,
  ClipboardList,
  Contact,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { NavLink } from "@/components/nav-link";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-white">
        <div className="border-b border-border px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">ChainOS</p>
          <p className="mt-0.5 truncate text-sm font-medium text-ink" title={user.tenantSlug}>
            Siam Distribution
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          <NavLink href="/dashboard" icon={<LayoutDashboard className="size-4" aria-hidden />}>
            Dashboard
          </NavLink>
          <NavLink href="/suppliers" icon={<Building2 className="size-4" aria-hidden />}>
            Suppliers
          </NavLink>
          <NavLink href="/customers" icon={<Contact className="size-4" aria-hidden />}>
            Customers
          </NavLink>
          <NavLink href="/products" icon={<Package className="size-4" aria-hidden />}>
            Products
          </NavLink>
          <NavLink href="/purchase-orders" icon={<ClipboardList className="size-4" aria-hidden />}>
            Purchase Orders
          </NavLink>
          <NavLink href="/sales-orders" icon={<ShoppingCart className="size-4" aria-hidden />}>
            Sales Orders
          </NavLink>
          <NavLink href="/inventory" icon={<Boxes className="size-4" aria-hidden />}>
            Inventory
          </NavLink>
          <NavLink href="/warehouses" icon={<WarehouseIcon className="size-4" aria-hidden />}>
            Warehouses
          </NavLink>
          <NavLink href="/shipments" icon={<Truck className="size-4" aria-hidden />}>
            Shipments
          </NavLink>
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="mb-1 px-1">
            <p className="truncate text-sm font-medium text-ink" title={user.name}>
              {user.name}
            </p>
            <p className="truncate text-xs text-ink-faint" title={user.email}>
              {user.roleName}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
