import Link from "next/link";
import { Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { warehouseStatusTone } from "@/lib/status";

export default async function WarehousesPage() {
  let warehouses: Warehouse[];
  try {
    warehouses = await apiGet<Warehouse[]>("/warehouses");
  } catch {
    return (
      <>
        <PageHeader title="Warehouses" />
        <ErrorState message="Could not load warehouses from the API." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Warehouses"
        description={`${warehouses.length} warehouse${warehouses.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/warehouses/new">
            <Plus className="size-4" /> New Warehouse
          </ButtonLink>
        }
      />

      <Card>
        {warehouses.length === 0 ? (
          <EmptyState
            icon={WarehouseIcon}
            title="No warehouses yet"
            description="Add a warehouse before creating purchase orders."
            action={
              <ButtonLink href="/warehouses/new" size="sm">
                <Plus className="size-4" /> New Warehouse
              </ButtonLink>
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Address</Th>
                <Th>Province</Th>
                <Th>Country</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {warehouses.map((w) => (
                <Tr key={w.id}>
                  <Td className="font-mono text-xs text-ink-soft">{w.code}</Td>
                  <Td>
                    <Link href={`/warehouses/${w.id}`} className="font-medium text-accent hover:underline">
                      {w.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{w.address ?? "—"}</Td>
                  <Td className="text-ink-soft">{w.province ?? "—"}</Td>
                  <Td className="text-ink-soft">{w.country ?? "—"}</Td>
                  <Td>
                    <Badge tone={warehouseStatusTone(w.status)}>{w.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
