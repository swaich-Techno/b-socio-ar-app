import { PrintableInvoice } from "@/components/invoice-page";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return <PrintableInvoice invoiceId={(await params).id} />;
}
