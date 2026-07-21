import Link from "next/link";
import { AuthPage } from "@/components/auth-page";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() { return <AuthPage title="Reset your password" description="Enter your account email. For privacy, the response is the same whether or not an account exists." footer={<Link href="/login">Return to sign in</Link>}><ForgotPasswordForm /></AuthPage>; }
