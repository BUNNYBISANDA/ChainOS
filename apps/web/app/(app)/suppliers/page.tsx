import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Supplier } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { supplierStatusTone } from "@/lib/status";
import { formatDate } from "@/lib/format";

export default async function SuppliersPage() {
  let suppliers: Supplier[];
  try {
    suppliers = await apiGet<Supplier[]>("/suppliers");
  } catch {
    return (
      <>
        <PageHeader title="Suppliers" />
        <ErrorState message="Could not load suppliers from the API." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}`}
        action={
          <ButtonLink href="/suppliers/new">
            <Plus className="size-4" /> New Supplier
          </ButtonLink>
        }
      />

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No suppliers yet"
            description="Add your first supplier to start creating purchase orders."
            action={
              <ButtonLink href="/suppliers/new" size="sm">
                <Plus className="size-4" /> New Supplier
              </ButtonLink>
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Country</Th>
                <Th>Contact</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </Tr>
            </Thead>
            <Tbody>
              {suppliers.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-mono text-xs text-ink-soft">{s.code}</Td>
                  <Td>
                    <Link href={`/suppliers/${s.id}`} className="font-medium text-accent hover:underline">
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{s.country ?? "—"}</Td>
                  <Td className="text-ink-soft">{s.contactName ?? "—"}</Td>
                  <Td className="text-ink-soft">{s.email ?? "—"}</Td>
                  <Td>
                    <Badge tone={supplierStatusTone(s.status)}>{s.status}</Badge>
                  </Td>
                  <Td className="text-ink-soft">{formatDate(s.createdAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
