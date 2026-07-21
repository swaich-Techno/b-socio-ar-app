import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Administrator sign in", robots: { index: false, follow: false } };
export default function AdminLoginPage() { return <AuthPage title="Administrator access" description="Use your assigned B Socio role. Administrator registration is not available." admin><Suspense fallback={<div className="auth-loading">Preparing administrator sign in…</div>}><LoginForm admin /></Suspense></AuthPage>; }
