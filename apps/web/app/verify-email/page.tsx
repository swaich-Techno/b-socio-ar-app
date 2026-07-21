"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";
import { AuthPage } from "@/components/auth-page";

export default function VerifyEmailPage() {
  return (
    <AuthPage title="Verify your email" description="We are checking the secure link sent to your inbox.">
      <Suspense fallback={<VerificationStatus state="loading" message="Preparing your secure verification…" />}>
        <VerifyEmailContent />
      </Suspense>
    </AuthPage>
  );
}

function VerifyEmailContent() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your secure email link…");

  useEffect(() => {
    if (!token) { setState("error"); setMessage("This verification link is incomplete."); return; }
    let cancelled = false;
    fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        const payload = await response.json() as { data?: { message?: string }; error?: { message?: string } };
        if (cancelled) return;
        if (!response.ok) { setState("error"); setMessage(payload.error?.message ?? "Email verification failed."); }
        else { setState("success"); setMessage(payload.data?.message ?? "Email verified successfully."); }
      })
      .catch(() => { if (!cancelled) { setState("error"); setMessage("Email verification could not be completed."); } });
    return () => { cancelled = true; };
  }, [token]);

  return <VerificationStatus state={state} message={message} />;
}

function VerificationStatus({ state, message }: { state: "loading" | "success" | "error"; message: string }) {
  return (
    <div className={`auth-verification ${state}`} role="status" aria-live="polite">
      <span className="auth-verification-icon">
        {state === "loading" ? <LoaderCircle className="spin" size={28} /> : state === "success" ? <CheckCircle2 size={28} /> : <ShieldAlert size={28} />}
      </span>
      <div>
        <h2>{state === "success" ? "Email verified" : state === "error" ? "Link unavailable" : "Checking your link"}</h2>
        <p>{message}</p>
      </div>
      {state !== "loading" ? <Link className="button button-primary" href="/login">Continue to sign in</Link> : null}
    </div>
  );
}
