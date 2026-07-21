import { Suspense } from "react";
import { AuthPage } from "@/components/auth-page";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Set a new password" };
export default function ResetPasswordPage() { return <AuthPage title="Choose a new password" description="Use at least 12 characters with uppercase, lowercase, number and symbol."><Suspense fallback={<div className="auth-loading">Checking reset link…</div>}><ResetPasswordForm /></Suspense></AuthPage>; }
