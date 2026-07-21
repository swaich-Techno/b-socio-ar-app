import { AdminSection } from "@/components/admin-pages";
export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) { return <AdminSection section={(await params).section} />; }
