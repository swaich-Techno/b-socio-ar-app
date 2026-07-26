import Link from "next/link";
import { AuthPage } from "@/components/auth-page";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Administrator password recovery" };

export default function AdminForgotPasswordPage() {
  return (
    <AuthPage
      title="Recover administrator access"
      description="Enter your assigned administrator email. For privacy, the response is the same whether or not an account exists."
      footer={<Link href="/admin/login">Return to administrator sign in</Link>}
      admin
    >
      <ForgotPasswordForm admin />
    </AuthPage>
  );
}
