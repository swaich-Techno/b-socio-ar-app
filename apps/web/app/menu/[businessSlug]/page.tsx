import type { Metadata } from "next";
import { RestaurantMenu } from "@/components/restaurant-menu";
export const metadata: Metadata = { title: "Restaurant menu", robots: { index: false, follow: false } };
export default async function MenuPage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ session?: string }> }) {
  const [{ businessSlug }, { session }] = await Promise.all([params, searchParams]);
  return <RestaurantMenu businessSlug={businessSlug} sessionToken={session ?? ""} />;
}
