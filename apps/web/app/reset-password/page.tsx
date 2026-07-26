import Link from "next/link";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Set a new password" };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const admin = (await searchParams).portal === "admin";
  return <AuthPage title="Choose a new password" description="Use at least 12 characters with uppercase, lowercase, number and symbol." footer={<Link href={admin ? "/admin/login" : "/login"}>Return to sign in</Link>} admin={admin}><Suspense fallback={<div className="auth-loading">Checking reset link…</div>}><ResetPasswordForm /></Suspense></AuthPage>;
}
