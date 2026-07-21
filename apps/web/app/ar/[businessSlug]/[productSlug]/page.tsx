import type { Metadata } from "next";
import { PublicArExperience } from "@/components/public-ar-experience";
export const metadata: Metadata = { title: "Product AR experience", robots: { index: false, follow: false } };
export default async function ArPage({ params }: { params: Promise<{ businessSlug: string; productSlug: string }> }) { const { businessSlug, productSlug } = await params; return <PublicArExperience businessSlug={businessSlug} productSlug={productSlug} />; }
