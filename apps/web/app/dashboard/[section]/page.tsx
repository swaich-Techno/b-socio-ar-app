import { CustomerSection } from "@/components/dashboard-pages";
export default async function DashboardSectionPage({ params }: { params: Promise<{ section: string }> }) { return <CustomerSection section={(await params).section} />; }
