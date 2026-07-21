import { ProductWorkspace } from "@/components/product-workspace";
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) { return <ProductWorkspace productId={(await params).id} />; }
