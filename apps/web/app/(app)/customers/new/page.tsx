import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { createCustomerAction } from "@/lib/actions/customers";
import { CustomerForm } from "../customer-form";

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader title="New Customer" description="Create a customer for outbound sales orders." />
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardBody>
          <CustomerForm action={createCustomerAction} submitLabel="Create Customer" />
        </CardBody>
      </Card>
    </>
  );
}
