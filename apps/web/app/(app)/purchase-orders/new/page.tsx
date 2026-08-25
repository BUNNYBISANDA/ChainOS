import { apiGet } from "@/lib/api";
import type { Product, Supplier, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertTriangle } from "lucide-react";
import { PurchaseOrderForm } from "./po-form";

export default async function NewPurchaseOrderPage() {
  let suppliers: Supplier[];
  let warehouses: Warehouse[];
  let products: Product[];
  try {
    [suppliers, warehouses, products] = await Promise.all([
      apiGet<Supplier[]>("/suppliers"),
      apiGet<Warehouse[]>("/warehouses"),
      apiGet<Product[]>("/products?active=true"),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="New Purchase Order" />
        <ErrorState message="Could not load suppliers, warehouses, or products." />
      </>
    );
  }

  if (suppliers.length === 0 || warehouses.length === 0 || products.length === 0) {
    return (
      <>
        <PageHeader title="New Purchase Order" />
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Set up your catalog first"
            description="You need at least one supplier, one warehouse, and one active product before creating a purchase order."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New Purchase Order" />
      <Card>
        <CardBody>
          <PurchaseOrderForm suppliers={suppliers} warehouses={warehouses} products={products} />
        </CardBody>
      </Card>
    </>
  );
}
