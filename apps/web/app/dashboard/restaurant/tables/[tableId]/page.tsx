import { RestaurantTablesAdmin } from "@/components/commerce-admin";
export const metadata = { title: "Edit restaurant table" };
export default async function RestaurantTablePage({ params }: { params: Promise<{ tableId: string }> }) { return <RestaurantTablesAdmin mode="edit" tableId={(await params).tableId} />; }
