"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { businessSchema } from "@bsocio/validation";
import { Button, Card, Field, Input } from "@bsocio/ui";
import { LoaderCircle } from "lucide-react";

type BusinessInput = z.infer<typeof businessSchema>;
export function OnboardingForm() {
  const router = useRouter(); const [serverError, setServerError] = useState("");
  const form = useForm<BusinessInput>({ resolver: zodResolver(businessSchema), defaultValues: { name: "", slug: "", category: "", country: "", website: "", whatsapp: "", instagram: "", primaryColour: "#2563EB" } });
  useEffect(() => { fetch("/api/business").then((response) => response.json()).then((payload: { data?: { business?: Partial<BusinessInput> } }) => { if (payload.data?.business) form.reset({ ...form.getValues(), ...payload.data.business }); }).catch(() => undefined); }, [form]);
  const submit = form.handleSubmit(async (values) => { setServerError(""); const response = await fetch("/api/business", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const payload = await response.json() as { error?: { message?: string } }; if (!response.ok) { setServerError(payload.error?.message ?? "Unable to save business."); return; } router.push("/dashboard/business"); router.refresh(); });
  return <Card className="form-card"><form className="auth-form" onSubmit={submit} noValidate>{serverError ? <div className="form-alert" role="alert">{serverError}</div> : null}<div className="form-grid"><Field label="Business name" error={form.formState.errors.name?.message} required><Input autoComplete="organization" {...form.register("name")} /></Field><Field label="Business URL slug" error={form.formState.errors.slug?.message} hint="Lowercase letters, numbers and hyphens." required><Input inputMode="url" {...form.register("slug")} /></Field><Field label="Category" error={form.formState.errors.category?.message} required><Input {...form.register("category")} /></Field><Field label="Country" error={form.formState.errors.country?.message} required><Input autoComplete="country-name" {...form.register("country")} /></Field><Field label="Website" error={form.formState.errors.website?.message}><Input type="url" inputMode="url" autoComplete="url" placeholder="https://" {...form.register("website")} /></Field><Field label="WhatsApp number or URL" error={form.formState.errors.whatsapp?.message}><Input type="tel" {...form.register("whatsapp")} /></Field><Field label="Instagram handle or URL" error={form.formState.errors.instagram?.message}><Input {...form.register("instagram")} /></Field><Field label="Brand colour" error={form.formState.errors.primaryColour?.message}><Input type="color" {...form.register("primaryColour")} /></Field></div><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <><LoaderCircle className="spin" size={18} /> Saving…</> : "Save business profile"}</Button></form></Card>;
}
