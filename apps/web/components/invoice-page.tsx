"use client";

import Link from "next/link";
import { ArrowLeft, FileText, Printer, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@bsocio/ui";
import { useApi } from "@/hooks/use-api";

type InvoiceData = {
  _id: string;
  invoiceNumber: string;
  companyName: string;
  billingAddress: string;
  taxIdentificationNumber?: string;
  planName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  baseAmount: number;
  discount: number;
  overageCharges: number;
  addOnCharges: number;
  tax: number;
  total: number;
  currency: string;
  paymentStatus: string;
  paymentDate?: string;
  paymentReference?: string;
  taxConfigurationReviewed: boolean;
  isTest: boolean;
  createdAt: string;
  items: Array<{ _id: string; description: string; quantity: number; unitAmount: number; amount: number; type: string }>;
};

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: "long" });

export function PrintableInvoice({ invoiceId }: { invoiceId: string }) {
  const state = useApi<InvoiceData>(`/api/billing/invoices/${invoiceId}`);
  if (state.loading) return <div className="dashboard-page"><Card className="skeleton-card large" /></div>;
  if (state.error || !state.data) {
    return <div className="dashboard-page"><Card className="error-state"><FileText size={28} /><div><strong>Invoice unavailable</strong><p>{state.error}</p></div><Button variant="secondary" onClick={state.reload}><RefreshCw size={17} /> Retry</Button></Card></div>;
  }
  const invoice = state.data;
  return (
    <div className="invoice-screen">
      <div className="invoice-toolbar">
        <Link className="button button-secondary" href="/dashboard/billing"><ArrowLeft size={17} /> Back to billing</Link>
        <Button onClick={() => window.print()}><Printer size={17} /> Print invoice</Button>
      </div>
      <article className="invoice-sheet">
        {invoice.isTest ? <div className="invoice-test-watermark" aria-label="Test invoice">TEST</div> : null}
        <header className="invoice-head">
          <div><span className="invoice-brand">Locate Now</span><small>Subscription services by B Socio</small></div>
          <div><span className="eyebrow">Invoice</span><h1>{invoice.invoiceNumber}</h1><Badge tone={invoice.paymentStatus === "PAID" ? "success" : "warning"}>{invoice.paymentStatus.replaceAll("_", " ")}</Badge></div>
        </header>
        <div className="invoice-parties">
          <section><span>Bill to</span><strong>{invoice.companyName}</strong><p>{invoice.billingAddress || "Billing address not configured"}</p>{invoice.taxIdentificationNumber ? <p>Tax ID: {invoice.taxIdentificationNumber}</p> : null}</section>
          <dl><div><dt>Issue date</dt><dd>{date(invoice.createdAt)}</dd></div><div><dt>Billing period</dt><dd>{date(invoice.billingPeriodStart)} – {date(invoice.billingPeriodEnd)}</dd></div><div><dt>Plan</dt><dd>{invoice.planName}</dd></div><div><dt>Currency</dt><dd>{invoice.currency}</dd></div></dl>
        </div>
        <table className="invoice-lines">
          <thead><tr><th>Description</th><th>Quantity</th><th>Unit amount</th><th>Amount</th></tr></thead>
          <tbody>{invoice.items.map((item) => <tr key={item._id}><td>{item.description}<small>{item.type.replaceAll("_", " ")}</small></td><td>{item.quantity}</td><td>{money(item.unitAmount, invoice.currency)}</td><td>{money(item.amount, invoice.currency)}</td></tr>)}</tbody>
        </table>
        <div className="invoice-totals">
          <dl>
            <div><dt>Base amount</dt><dd>{money(invoice.baseAmount, invoice.currency)}</dd></div>
            {invoice.discount ? <div><dt>Discount</dt><dd>−{money(invoice.discount, invoice.currency)}</dd></div> : null}
            {invoice.overageCharges ? <div><dt>Overage</dt><dd>{money(invoice.overageCharges, invoice.currency)}</dd></div> : null}
            {invoice.addOnCharges ? <div><dt>Add-ons</dt><dd>{money(invoice.addOnCharges, invoice.currency)}</dd></div> : null}
            <div><dt>Tax</dt><dd>{money(invoice.tax, invoice.currency)}</dd></div>
            <div className="invoice-total"><dt>Total</dt><dd>{money(invoice.total, invoice.currency)}</dd></div>
          </dl>
        </div>
        <footer className="invoice-footer">
          <div><strong>Payment</strong><span>{invoice.paymentDate ? `Paid ${date(invoice.paymentDate)}` : invoice.paymentStatus}{invoice.paymentReference ? ` · ${invoice.paymentReference}` : ""}</span></div>
          <p>{invoice.taxConfigurationReviewed ? "Tax configuration has been marked reviewed for this record." : "This invoice contains tax-ready structured data. Local tax configuration has not been marked reviewed, so this document does not claim tax compliance."}</p>
        </footer>
      </article>
    </div>
  );
}
