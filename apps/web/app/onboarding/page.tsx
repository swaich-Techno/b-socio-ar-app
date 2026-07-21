import { PageHeader } from "@/components/dashboard-pages";
import { OnboardingForm } from "@/components/onboarding-form";
import { DashboardShell } from "@/components/dashboard-shell";
export const metadata = { title: "Business onboarding" };
export default function OnboardingPage() { return <DashboardShell><div className="dashboard-page"><PageHeader title="Business onboarding" description="Set the identity used by your draft and future live AR experiences." /><OnboardingForm /></div></DashboardShell>; }
