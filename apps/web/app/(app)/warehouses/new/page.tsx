import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { createWarehouseAction } from "@/lib/actions/warehouses";
import { WarehouseForm } from "../warehouse-form";

export default function NewWarehousePage() {
  return (
    <>
      <PageHeader title="New Warehouse" />
      <Card>
        <CardBody>
          <WarehouseForm action={createWarehouseAction} submitLabel="Create Warehouse" />
        </CardBody>
      </Card>
    </>
  );
}
