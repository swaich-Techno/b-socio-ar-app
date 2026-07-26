import Link from "next/link";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Customer sign in" };
export default function LoginPage() { return <AuthPage title="Welcome back" description="Sign in to continue your product AR demo." footer={<span>New to B Socio AR? <Link href="/register">Create a demo account</Link></span>}><Suspense fallback={<div className="auth-loading">Preparing secure sign in…</div>}><LoginForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} /></Suspense></AuthPage>; }
