import Link from "next/link";
import { AuthPage } from "@/components/auth-page";
import { RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Create demo account" };
export default function RegisterPage() { return <AuthPage title="Create your secure demo" description="Start with one business, one demo project and up to five products." footer={<span>Already registered? <Link href="/login">Sign in</Link></span>}><RegisterForm /></AuthPage>; }
