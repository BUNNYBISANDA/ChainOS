import { apiGet } from "@/lib/api";
import type { Customer, Product, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { SalesOrderForm } from "./sales-order-form";

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  let customers: Customer[];
  let warehouses: Warehouse[];
  let products: Product[];
  try {
    [customers, warehouses, products] = await Promise.all([
      apiGet<Customer[]>("/customers"),
      apiGet<Warehouse[]>("/warehouses"),
      apiGet<Product[]>("/products"),
    ]);
  } catch {
    return <ErrorState message="Could not load the data needed to create a sales order." />;
  }

  return (
    <>
      <PageHeader title="New Sales Order" description="Create an outbound customer order." />
      <Card>
        <CardHeader>
          <CardTitle>Sales order details</CardTitle>
        </CardHeader>
        <CardBody>
          <SalesOrderForm customers={customers} warehouses={warehouses} products={products} defaultCustomerId={params.customerId} />
        </CardBody>
      </Card>
    </>
  );
}
