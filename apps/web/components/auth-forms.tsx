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

const googleErrorMessages: Record<string, string> = {
  not_configured: "Google sign-in is not configured yet. Use your email and password.",
  cancelled: "Google sign-in was cancelled.",
  session_expired: "The Google sign-in session expired. Please try again.",
  state_mismatch: "The Google sign-in response could not be verified. Please try again.",
  account_not_found: "Create your B Socio account before using Google sign-in.",
  account_unavailable: "This account is unavailable. Contact support.",
  wrong_portal: "Use the correct customer or administrator sign-in page for this account.",
  account_mismatch: "This email is already linked to a different Google account.",
};

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.86A6.01 6.01 0 0 1 6.08 12c0-.65.11-1.27.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.48l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z" />
    </svg>
  );
}

export function LoginForm({ admin = false, googleEnabled = false }: { admin?: boolean; googleEnabled?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const [serverError, setServerError] = useState("");
  const googleError = search.get("google_error");
  const requested = search.get("next");
  const googleParams = new URLSearchParams({ portal: admin ? "admin" : "customer" });
  if (requested) googleParams.set("next", requested);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const submit = form.handleSubmit(async (values) => {
    setServerError("");
    try {
      const data = await submitJson(admin ? "/api/auth/admin-login" : "/api/auth/login", values);
      const safeRequested = requested && requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\") && (admin ? requested.startsWith("/admin") : !requested.startsWith("/admin"));
      router.push(safeRequested ? requested : String(data.redirectTo ?? (admin ? "/admin" : "/dashboard")));
      router.refresh();
    } catch (error) { setServerError(error instanceof Error ? error.message : "Sign-in failed."); }
  });
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}
      {!serverError && googleError ? <div className="form-alert" role="alert">{googleErrorMessages[googleError] ?? "Google sign-in could not be completed. Please try again."}</div> : null}
      {googleEnabled ? <><Link className="button button-google" href={`/api/auth/google/start?${googleParams.toString()}`}><GoogleLogo /> Continue with Google</Link><div className="auth-divider"><span>or continue with email</span></div></> : null}
      <Field label="Email address" error={form.formState.errors.email?.message} required><Input type="email" inputMode="email" autoComplete="email" placeholder="you@business.com" {...form.register("email")} /></Field>
      <PasswordInput registration={form.register("password")} error={form.formState.errors.password?.message} />
      <div className={`form-between${admin ? " form-end" : ""}`}>{!admin ? <label className="check-row"><input type="checkbox" /> <span>Keep this device signed in</span></label> : null}<Link href={admin ? "/admin/forgot-password" : "/forgot-password"}>Forgot password?</Link></div>
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

export function ForgotPasswordForm({ admin = false }: { admin?: boolean }) {
  const [message, setMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "", portal: admin ? "admin" : "customer" } });
  const submit = form.handleSubmit(async (values) => { setServerError(""); try { const data = await submitJson("/api/auth/forgot-password", values); setMessage(String(data.message)); } catch (error) { setServerError(error instanceof Error ? error.message : "Request failed."); } });
  return <form className="auth-form" onSubmit={submit} noValidate>{serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}{message ? <div className="form-success" role="status">{message}</div> : null}<input type="hidden" {...form.register("portal")} /><Field label="Account email" error={form.formState.errors.email?.message} required><Input type="email" inputMode="email" autoComplete="email" {...form.register("email")} /></Field><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="spin" size={18} /> Sending…</> : "Send reset instructions"}</Button></form>;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [serverError, setServerError] = useState("");
  const form = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token: search.get("token") ?? "", password: "", confirmPassword: "" } });
  const submit = form.handleSubmit(async (values) => { setServerError(""); try { const data = await submitJson("/api/auth/reset-password", values); router.push(String(data.redirectTo ?? "/login?reset=1")); } catch (error) { setServerError(error instanceof Error ? error.message : "Reset failed."); } });
  return <form className="auth-form" onSubmit={submit} noValidate>{serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}<input type="hidden" {...form.register("token")} /><PasswordInput registration={form.register("password")} error={form.formState.errors.password?.message} autoComplete="new-password" /><PasswordInput registration={form.register("confirmPassword")} label="Confirm password" error={form.formState.errors.confirmPassword?.message} autoComplete="new-password" /><Button type="submit" disabled={form.formState.isSubmitting}>Set new password</Button></form>;
}
