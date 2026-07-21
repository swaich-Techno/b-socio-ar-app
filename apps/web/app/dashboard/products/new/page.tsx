import { PageHeader } from "@/components/dashboard-pages";
import { ProductForm } from "@/components/product-form";
export const metadata = { title: "Add product" };
export default function NewProductPage() { return <div className="dashboard-page"><PageHeader title="Add a demo product" description="Describe the physical product before uploading its private image views." /><ProductForm /></div>; }
