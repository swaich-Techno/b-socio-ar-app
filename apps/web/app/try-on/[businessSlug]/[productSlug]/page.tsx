import type { Metadata } from "next";
import { PublicArExperience } from "@/components/public-ar-experience";
export const metadata: Metadata = { title: "Jewellery virtual try-on", robots: { index: false, follow: false } };
export default async function JewelleryTryOnPage({ params }: { params: Promise<{ businessSlug: string; productSlug: string }> }) {
  const { businessSlug, productSlug } = await params;
  return <PublicArExperience businessSlug={businessSlug} productSlug={productSlug} experienceKind="jewellery" />;
}
