import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";

export function AuthPage({ title, description, children, footer, admin = false }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode; admin?: boolean }) {
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-aside" aria-label="Platform benefits"><Brand /><div><span className="eyebrow">{admin ? "Protected operations" : "A five-product path to AR"}</span><h2>{admin ? "Review with clarity. Publish with confidence." : "Your products deserve more than a flat product page."}</h2><p>{admin ? "Role-aware queues, worker health, audit history and payment gates keep every release accountable." : "Create a private demo, follow real 3D progress, review every model and publish only when your business is ready."}</p></div><div className="auth-benefits"><span><Check size={17} /> Private source images</span><span><Check size={17} /> Human approval controls</span><span><LockKeyhole size={17} /> Secure, expiring model access</span></div></section>
      <section className="auth-main"><div className="auth-card"><Link className="back-link" href="/"><ArrowLeft size={17} /> Back to B Socio AR</Link><div className="auth-heading"><h1>{title}</h1><p>{description}</p></div>{children}{footer ? <div className="auth-footer">{footer}</div> : null}</div></section>
    </main>
  );
}
