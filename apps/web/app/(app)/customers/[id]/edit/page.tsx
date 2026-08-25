import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { updateCustomerAction } from "@/lib/actions/customers";
import { CustomerForm } from "../../customer-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let customers: Customer[];
  try {
    customers = await apiGet<Customer[]>("/customers");
  } catch {
    return <ErrorState message="Could not load this customer." />;
  }

  const customer = customers.find((item) => item.id === id);
  if (!customer) notFound();

  return (
    <>
      <PageHeader title="Edit Customer" description={customer.companyName} />
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardBody>
          <CustomerForm action={updateCustomerAction.bind(null, customer.id)} customer={customer} submitLabel="Save Customer" />
        </CardBody>
      </Card>
    </>
  );
}
