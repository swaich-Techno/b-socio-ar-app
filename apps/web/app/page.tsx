import Link from "next/link";
import {
  ArrowRight,
  Box,
  Check,
  ClipboardCheck,
  Gem,
  LockKeyhole,
  MessageCircle,
  QrCode,
  ScanLine,
  ShieldCheck,
  Store,
  UploadCloud,
  Utensils,
} from "lucide-react";
import { Brand } from "@/components/brand";

const features = [
  { icon: UploadCloud, title: "Controlled assets", text: "Source images and draft models remain private, with short-lived links and ownership checks at every upload." },
  { icon: ClipboardCheck, title: "Review-led publishing", text: "Generation, feedback, payment and approval states stay visible before any customer experience goes live." },
  { icon: ScanLine, title: "One operating layer", text: "Manage AR pages, dynamic QR destinations and commerce activity from the same accountable workflow." },
];

const steps = [
  ["01", "Set up the business", "Create a workspace, identify the commerce category and add the first products or menu items."],
  ["02", "Prepare the experience", "Upload private source images, generate 3D drafts and review each model against the product."],
  ["03", "Configure the journey", "Connect AR pages to table ordering, product enquiries or a standard dynamic QR destination."],
  ["04", "Approve and publish", "Complete review and payment checks, then publish only the approved customer-facing assets."],
];

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Brand />
          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#platform">Platform</a><a href="#commerce">Commerce</a><a href="#workflow">Workflow</a><a href="#security">Security</a>
          </nav>
          <div className="site-actions"><Link className="button button-ghost" href="/login">Sign in</Link><Link className="button button-primary" href="/register">Start a demo</Link></div>
        </div>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">AR commerce operations</span>
              <h1 className="display">Make every scan lead somewhere useful.</h1>
              <p>Build, review and operate product AR—then connect it to dynamic QR, restaurant table ordering or jewellery enquiries on WhatsApp.</p>
              <div className="hero-ctas"><Link className="button button-primary" href="/register">Create a business demo <ArrowRight size={18} /></Link><a className="button button-secondary" href="#commerce">Explore commerce paths</a></div>
              <div className="hero-note"><span><Check size={16} /> Five-product demo workspace</span><span><LockKeyhole size={16} /> Private drafts and source files</span></div>
            </div>
            <div className="operations-preview" aria-label="B Socio AR operating workflow">
              <div className="operations-window">
                <div className="operations-head">
                  <div>
                    <span className="eyebrow">Workflow map</span>
                    <strong>From asset to customer action</strong>
                  </div>
                  <span className="status-indicator"><i /> Controlled release</span>
                </div>
                <div className="operations-list">
                  <div className="operation-row">
                    <span className="operation-icon"><Box size={18} /></span>
                    <span><strong>Product model</strong><small>Private upload → 3D draft → human review</small></span>
                    <span className="badge badge-warning">Review gate</span>
                  </div>
                  <div className="operation-row">
                    <span className="operation-icon"><Utensils size={18} /></span>
                    <span><strong>Restaurant table</strong><small>QR scan → live menu → table order</small></span>
                    <span className="badge badge-success">Order path</span>
                  </div>
                  <div className="operation-row">
                    <span className="operation-icon"><Gem size={18} /></span>
                    <span><strong>Jewellery product</strong><small>AR view → product context → WhatsApp enquiry</small></span>
                    <span className="badge badge-info">Enquiry path</span>
                  </div>
                </div>
                <div className="operations-foot">
                  <span><ShieldCheck size={17} /> Approval and audit history remain attached to every release.</span>
                  <QrCode size={22} aria-hidden="true" />
                </div>
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
        <section className="section commerce-section" id="commerce">
          <div className="container commerce-layout">
            <div className="section-head">
              <span className="eyebrow">Commerce that follows the product</span>
              <h2>Choose the action that fits the buying decision.</h2>
              <p>B Socio AR does not stop at the 3D view. Each business can connect the experience to an operating path designed for its category.</p>
            </div>
            <div className="commerce-grid">
              <article className="commerce-card">
                <span className="commerce-number">01</span>
                <span className="feature-icon"><Store size={22} /></span>
                <h3>Restaurant table ordering</h3>
                <p>Give every table a managed QR destination with a mobile menu, cart, order activity and restaurant analytics.</p>
                <span className="commerce-route"><QrCode size={16} /> Scan <ArrowRight size={14} /> Browse <ArrowRight size={14} /> Order</span>
              </article>
              <article className="commerce-card">
                <span className="commerce-number">02</span>
                <span className="feature-icon"><Gem size={22} /></span>
                <h3>Jewellery WhatsApp enquiries</h3>
                <p>Move from product AR or virtual try-on into a structured enquiry with product context ready for the sales conversation.</p>
                <span className="commerce-route"><ScanLine size={16} /> View <ArrowRight size={14} /> Try on <ArrowRight size={14} /> <MessageCircle size={16} /> Enquire</span>
              </article>
            </div>
          </div>
        </section>
        <section className="section" id="workflow">
          <div className="container">
            <div className="section-head"><span className="eyebrow">From source file to live journey</span><h2>A clear operating sequence, with review built in.</h2><p>Every product keeps its source images, generation job, model, AR experience, QR destination, approval history and activity together.</p></div>
            <div className="workflow-grid">{steps.map(([number, title, text]) => <article className="card workflow-card" key={number}><span>Step {number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
          </div>
        </section>
        <section className="section section-muted" id="security">
          <div className="container cta-band"><div><span className="eyebrow" style={{ color: "#93c5fd" }}>Built for global business</span><h2>Your originals remain yours.</h2><p>Private object storage, short-lived access, role checks, audit history and human approval are built into the workflow.</p></div><Link className="button" href="/register"><ShieldCheck size={18} /> Start securely</Link></div>
        </section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><Brand /><span>© {new Date().getFullYear()} B Socio AR. Controlled product experiences.</span><span>Private drafts · Reviewed releases · Dynamic destinations</span></div></footer>
    </>
  );
}
