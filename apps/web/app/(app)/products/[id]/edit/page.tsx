import { notFound } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import type { Product } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { updateProductAction } from "@/lib/actions/products";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product: Product;
  try {
    product = await apiGet<Product>(`/products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    return <ErrorState message="Could not load this product." />;
  }

  return (
    <>
      <PageHeader title={`Edit ${product.name}`} />
      <Card>
        <CardBody>
          <ProductForm action={updateProductAction.bind(null, id)} product={product} submitLabel="Save Changes" />
        </CardBody>
      </Card>
    </>
  );
}
