import Link from "next/link";
import { ArrowRight, Box, Check, LockKeyhole, QrCode, ScanLine, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { Brand } from "@/components/brand";

const features = [
  { icon: UploadCloud, title: "Private by design", text: "Original product images upload directly to a private R2 bucket through short-lived, ownership-checked links." },
  { icon: Box, title: "Open 3D pipeline", text: "A self-hosted TripoSR worker builds draft GLB models sequentially, with real progress and review states." },
  { icon: ScanLine, title: "Publish when ready", text: "Administrator review, custom packages and verified payment keep draft AR private until final approval." },
];

const steps = [
  ["01", "Build your demo", "Create one focused project and add up to five products from any phone or computer."],
  ["02", "Generate and review", "Upload private product views, queue one job at a time, and inspect each model securely."],
  ["03", "Approve the experience", "Review feedback product by product, then receive a package tailored to your business."],
  ["04", "Go live with dynamic QR", "After payment verification, approved AR pages and editable QR destinations become public."],
];

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Brand />
          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#workflow">How it works</a><a href="#platform">Platform</a><a href="#security">Security</a>
          </nav>
          <div className="site-actions"><Link className="button button-ghost" href="/login">Sign in</Link><Link className="button button-primary" href="/register">Start a demo</Link></div>
        </div>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Product AR, made accountable</span>
              <h1 className="display">Turn product photos into experiences people can step into.</h1>
              <p>B Socio AR brings private uploads, open-source 3D generation, hands-on quality review, mobile AR and dynamic QR publishing into one clear business workflow.</p>
              <div className="hero-ctas"><Link className="button button-primary" href="/register">Create your five-product demo <ArrowRight size={18} /></Link><a className="button button-secondary" href="#workflow">See the workflow</a></div>
              <div className="hero-note"><span><Check size={16} /> No fixed public pricing</span><span><LockKeyhole size={16} /> Draft assets stay private</span><span><Check size={16} /> Mobile-first from 320px</span></div>
            </div>
            <div className="hero-visual" aria-label="B Socio AR product model workflow preview">
              <div className="preview-panel">
                <div className="preview-head"><div><span className="eyebrow">Draft preview</span><strong style={{ display: "block", marginTop: 4 }}>Aurora bottle</strong></div><span className="badge badge-info">Ready for review</span></div>
                <div className="preview-stage" aria-hidden="true">
                  <div className="preview-scan-grid" />
                  <div className="preview-orbit preview-orbit-one" />
                  <div className="preview-orbit preview-orbit-two" />
                  <div className="preview-object" />
                  <span className="preview-anchor anchor-one" />
                  <span className="preview-anchor anchor-two" />
                  <span className="preview-anchor anchor-three" />
                </div>
                <div className="preview-pipeline" aria-label="Workflow: private upload, 3D generation, human review and dynamic QR">
                  <span><UploadCloud size={15} /> Upload</span>
                  <span><Box size={15} /> 3D draft</span>
                  <span><ShieldCheck size={15} /> Review</span>
                  <span><QrCode size={15} /> Publish</span>
                </div>
                <div className="preview-footer"><div className="mini-stat"><strong>92%</strong><span>Model optimisation complete</span></div><span className="button button-primary"><QrCode size={18} /> AR preview</span></div>
              </div>
            </div>
          </div>
        </section>
        <section className="section section-muted" id="platform">
          <div className="container">
            <div className="section-head"><span className="eyebrow">One controlled platform</span><h2>Fast enough for customers. Rigorous enough for your brand.</h2><p>The core workflow keeps ownership, quality, approval and publication visible at every step.</p></div>
            <div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="card feature-card" key={title}><span className="feature-icon"><Icon size={22} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
          </div>
        </section>
        <section className="section" id="workflow">
          <div className="container">
            <div className="section-head"><span className="eyebrow">From photo to live AR</span><h2>A guided path, not a maze of tools.</h2><p>Every product carries its own images, 3D job, model, AR experience, QR code, approval history and analytics.</p></div>
            <div className="workflow-grid">{steps.map(([number, title, text]) => <article className="card workflow-card" key={number}><span>Step {number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
          </div>
        </section>
        <section className="section section-muted" id="security">
          <div className="container cta-band"><div><span className="eyebrow" style={{ color: "#93c5fd" }}>Built for global business</span><h2>Your originals remain yours.</h2><p>Private object storage, short-lived access, role checks, audit history and human approval are built into the workflow.</p></div><Link className="button" href="/register"><ShieldCheck size={18} /> Start securely</Link></div>
        </section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><Brand /><span>© {new Date().getFullYear()} B Socio AR. Secure product experiences.</span><span><Sparkles size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> Built for mobile and desktop</span></div></footer>
    </>
  );
}
