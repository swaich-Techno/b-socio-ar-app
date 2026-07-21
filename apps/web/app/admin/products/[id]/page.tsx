import { AdminProductReview } from "@/components/admin-product-review";

export const metadata = { title: "Product quality review" };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminProductReview productId={id} />;
}
