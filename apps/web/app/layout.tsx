import type { Metadata, Viewport } from "next";
import { GoogleTag } from "@/components/google-tag";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "B Socio AR", template: "%s · B Socio AR" },
  description: "Turn product photography into reviewed 3D and mobile AR experiences with dynamic QR publishing.",
  applicationName: "B SOCIO AR APP",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F7F7F4" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head><GoogleTag /></head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
