import { notFound } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import type { Supplier } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { updateSupplierAction } from "@/lib/actions/suppliers";
import { SupplierForm } from "../../supplier-form";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supplier: Supplier;
  try {
    supplier = await apiGet<Supplier>(`/suppliers/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this supplier." />;
  }

  return (
    <>
      <PageHeader title={`Edit ${supplier.name}`} />
      <Card>
        <CardBody>
          <SupplierForm action={updateSupplierAction.bind(null, id)} supplier={supplier} submitLabel="Save Changes" />
        </CardBody>
      </Card>
    </>
  );
}
