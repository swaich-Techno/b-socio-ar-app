import type { Metadata } from "next";
import { PublicArExperience } from "@/components/public-ar-experience";
export const metadata: Metadata = { title: "Food 3D and table AR", robots: { index: false, follow: false } };
export default async function FoodArPage({ params, searchParams }: { params: Promise<{ businessSlug: string; productSlug: string }>; searchParams: Promise<{ session?: string; launch?: string }> }) {
  const [{ businessSlug, productSlug }, { session, launch }] = await Promise.all([params, searchParams]);
  return <PublicArExperience businessSlug={businessSlug} productSlug={productSlug} experienceKind="restaurant" sessionToken={session ?? ""} launchAr={launch === "ar"} />;
}
