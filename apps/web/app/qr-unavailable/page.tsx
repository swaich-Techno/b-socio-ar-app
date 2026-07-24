import Link from "next/link";
import { CircleAlert, ScanLine } from "lucide-react";
import { Card } from "@bsocio/ui";
import { Brand } from "@/components/brand";

export const metadata = { title: "QR unavailable", robots: { index: false, follow: false } };

export default async function QrUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; reason?: string }>;
}) {
  const { type, reason } = await searchParams;
  const table = type === "table";
  const message = table && reason === "inactive"
    ? "This table is not accepting orders. Please ask restaurant staff for an active table QR."
    : table
      ? "This table QR code is not recognised. Please ask restaurant staff for help."
      : "This product experience is not currently available.";
  return (
    <main className="commerce-status-page" id="main-content">
      <Brand />
      <Card className="commerce-status-card">
        <CircleAlert size={40} aria-hidden="true" />
        <h1>QR experience unavailable</h1>
        <p>{message}</p>
        <Link className="button button-primary" href="/"><ScanLine size={18} /> Visit B Socio AR</Link>
      </Card>
    </main>
  );
}
