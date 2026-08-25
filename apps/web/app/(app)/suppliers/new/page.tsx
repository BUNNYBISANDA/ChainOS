import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { createSupplierAction } from "@/lib/actions/suppliers";
import { SupplierForm } from "../supplier-form";

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader title="New Supplier" />
      <Card>
        <CardBody>
          <SupplierForm action={createSupplierAction} submitLabel="Create Supplier" />
        </CardBody>
      </Card>
    </>
  );
}
