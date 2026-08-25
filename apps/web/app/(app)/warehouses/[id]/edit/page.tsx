import { notFound } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import type { Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { updateWarehouseAction } from "@/lib/actions/warehouses";
import { WarehouseForm } from "../../warehouse-form";

export default async function EditWarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let warehouse: Warehouse;
  try {
    warehouse = await apiGet<Warehouse>(`/warehouses/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this warehouse." />;
  }

  return (
    <>
      <PageHeader title={`Edit ${warehouse.name}`} />
      <Card>
        <CardBody>
          <WarehouseForm action={updateWarehouseAction.bind(null, id)} warehouse={warehouse} submitLabel="Save Changes" />
        </CardBody>
      </Card>
    </>
  );
}
