import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { createProductAction } from "@/lib/actions/products";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New Product" />
      <Card>
        <CardBody>
          <ProductForm action={createProductAction} submitLabel="Create Product" />
        </CardBody>
      </Card>
    </>
  );
}
