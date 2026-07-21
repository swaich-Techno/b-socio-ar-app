"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { z } from "zod";
import { forgotPasswordSchema, loginSchema, registrationSchema, resetPasswordSchema } from "@bsocio/validation";
import { Button, Field, Input } from "@bsocio/ui";

type ErrorPayload = { error?: { message?: string; fieldErrors?: Record<string, string[]> } };

async function submitJson(path: string, values: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
  const payload = await response.json() as ErrorPayload & { data?: Record<string, unknown> };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The request could not be completed.");
  return payload.data;
}

function PasswordInput({ registration, label = "Password", error, autoComplete = "current-password" }: { registration: UseFormRegisterReturn; label?: string; error?: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error} required>
      <span className="password-field"><Input type={visible ? "text" : "password"} autoComplete={autoComplete} {...registration} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span>
    </Field>
  );
}

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const [serverError, setServerError] = useState("");
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const submit = form.handleSubmit(async (values) => {
    setServerError("");
    try {
      const data = await submitJson(admin ? "/api/auth/admin-login" : "/api/auth/login", values);
      const requested = search.get("next");
      const safeRequested = requested && requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\") && (admin ? requested.startsWith("/admin") : !requested.startsWith("/admin"));
      router.push(safeRequested ? requested : String(data.redirectTo ?? (admin ? "/admin" : "/dashboard")));
      router.refresh();
    } catch (error) { setServerError(error instanceof Error ? error.message : "Sign-in failed."); }
  });
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}
      <Field label="Email address" error={form.formState.errors.email?.message} required><Input type="email" inputMode="email" autoComplete="email" placeholder="you@business.com" {...form.register("email")} /></Field>
      <PasswordInput registration={form.register("password")} error={form.formState.errors.password?.message} />
      {!admin ? <div className="form-between"><label className="check-row"><input type="checkbox" /> <span>Keep this device signed in</span></label><Link href="/forgot-password">Forgot password?</Link></div> : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="spin" size={18} /> Signing in…</> : admin ? "Open admin workspace" : "Sign in"}</Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const form = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { fullName: "", email: "", country: "", countryCallingCode: "+1", mobileNumber: "", password: "", confirmPassword: "", businessName: "", businessCategory: "", termsAccepted: false as true, privacyAccepted: false as true },
  });
  const submit = form.handleSubmit(async (values) => {
    setServerError("");
    try { await submitJson("/api/auth/register", values); router.push("/login?registered=1"); }
    catch (error) { setServerError(error instanceof Error ? error.message : "Registration failed."); }
  });
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}
      <div className="form-grid">
        <Field label="Full name" error={form.formState.errors.fullName?.message} required><Input autoComplete="name" {...form.register("fullName")} /></Field>
        <Field label="Business email" error={form.formState.errors.email?.message} required><Input type="email" inputMode="email" autoComplete="email" {...form.register("email")} /></Field>
        <Field label="Country" error={form.formState.errors.country?.message} required><Input autoComplete="country-name" {...form.register("country")} /></Field>
        <div className="phone-grid"><Field label="Calling code" error={form.formState.errors.countryCallingCode?.message} required><Input type="tel" inputMode="tel" autoComplete="tel-country-code" {...form.register("countryCallingCode")} /></Field><Field label="Mobile number" error={form.formState.errors.mobileNumber?.message} required><Input type="tel" inputMode="tel" autoComplete="tel-national" {...form.register("mobileNumber")} /></Field></div>
        <Field label="Business name" error={form.formState.errors.businessName?.message} required><Input autoComplete="organization" {...form.register("businessName")} /></Field>
        <Field label="Business category" error={form.formState.errors.businessCategory?.message} required><Input placeholder="Furniture, fashion, manufacturing…" {...form.register("businessCategory")} /></Field>
        <PasswordInput registration={form.register("password")} error={form.formState.errors.password?.message} autoComplete="new-password" />
        <PasswordInput registration={form.register("confirmPassword")} label="Confirm password" error={form.formState.errors.confirmPassword?.message} autoComplete="new-password" />
      </div>
      <div className="consents"><label className="check-row"><input type="checkbox" {...form.register("termsAccepted")} /><span>I accept the terms of service.</span></label>{form.formState.errors.termsAccepted ? <span className="field-error">{form.formState.errors.termsAccepted.message}</span> : null}<label className="check-row"><input type="checkbox" {...form.register("privacyAccepted")} /><span>I accept the privacy policy.</span></label>{form.formState.errors.privacyAccepted ? <span className="field-error">{form.formState.errors.privacyAccepted.message}</span> : null}</div>
      <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="spin" size={18} /> Creating account…</> : "Create secure demo account"}</Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const submit = form.handleSubmit(async (values) => { setServerError(""); try { const data = await submitJson("/api/auth/forgot-password", values); setMessage(String(data.message)); } catch (error) { setServerError(error instanceof Error ? error.message : "Request failed."); } });
  return <form className="auth-form" onSubmit={submit} noValidate>{serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}{message ? <div className="form-success" role="status">{message}</div> : null}<Field label="Account email" error={form.formState.errors.email?.message} required><Input type="email" inputMode="email" autoComplete="email" {...form.register("email")} /></Field><Button type="submit" disabled={form.formState.isSubmitting}>Send reset instructions</Button></form>;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [serverError, setServerError] = useState("");
  const form = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token: search.get("token") ?? "", password: "", confirmPassword: "" } });
  const submit = form.handleSubmit(async (values) => { setServerError(""); try { await submitJson("/api/auth/reset-password", values); router.push("/login?reset=1"); } catch (error) { setServerError(error instanceof Error ? error.message : "Reset failed."); } });
  return <form className="auth-form" onSubmit={submit} noValidate>{serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}<input type="hidden" {...form.register("token")} /><PasswordInput registration={form.register("password")} error={form.formState.errors.password?.message} autoComplete="new-password" /><PasswordInput registration={form.register("confirmPassword")} label="Confirm password" error={form.formState.errors.confirmPassword?.message} autoComplete="new-password" /><Button type="submit" disabled={form.formState.isSubmitting}>Set new password</Button></form>;
}
