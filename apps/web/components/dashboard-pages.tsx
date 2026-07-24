"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Box,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  CreditCard,
  Cuboid,
  FileCheck2,
  FolderKanban,
  Images,
  LoaderCircle,
  PackageCheck,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  UploadCloud,
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@bsocio/ui";
import { apiPost, useApi } from "@/hooks/use-api";
import { BillingDashboard } from "@/components/billing-pages";

interface DashboardData {
  productsUsed: number;
  productLimit: number;
  jobsQueued: number;
  currentJob?: { progress: number; currentStep: string; status: string };
  modelsReady: number;
  changesRequested: number;
  approvedProducts: number;
  arExperiences: number;
  qrCodes: number;
  scans: number;
  packageStatus?: string;
}
interface ProductRecord {
  _id: string;
  name: string;
  slug: string;
  category: string;
  approvalStatus: string;
  description: string;
  updatedAt: string;
}
interface JobRecord {
  _id: string;
  productId: string;
  status: string;
  progress: number;
  currentStep: string;
  updatedAt: string;
  customerSafeError?: string;
}
interface PackageRecord {
  _id: string;
  name: string;
  currency: string;
  setupFee: number;
  monthlyFee?: number;
  annualFee?: number;
  tax?: number;
  discount?: number;
  productLimit: number;
  qrLimit: number;
  arLimit: number;
  storageGb: number;
  trafficGb: number;
  analyticsLevel: string;
  brandingOptions: string[];
  supportLevel: string;
  deliveryTimeline: string;
  renewalRules: string;
  expiresAt: string;
  customTerms: string;
  customerNotes?: string;
  status: string;
}
interface PaymentRecord {
  _id: string;
  transactionReference: string;
  method: string;
  status: string;
  customerNotes?: string;
  adminNotes?: string;
  createdAt: string;
}

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (
    ["PUBLISHED", "APPROVED_DEMO", "READY_FOR_REVIEW", "VERIFIED"].includes(
      status,
    )
  )
    return "success";
  if (["FAILED", "REJECTED", "CANCELLED"].includes(status)) return "danger";
  if (
    [
      "CHANGES_REQUESTED",
      "NEEDS_MANUAL_REVIEW",
      "CLARIFICATION_REQUESTED",
    ].includes(status)
  )
    return "warning";
  return status === "UPLOADED" ? "neutral" : "info";
}
const humanStatus = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());

function LoadingCards() {
  return (
    <div className="metric-grid" aria-label="Loading dashboard" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="card skeleton-card metric-skeleton" aria-hidden="true" key={index}>
          <span className="skeleton-icon" />
          <span className="skeleton-line short" />
          <span className="skeleton-line value" />
          <span className="skeleton-line" />
        </div>
      ))}
      <span className="sr-only">Loading workspace metrics</span>
    </div>
  );
}
function ErrorCard({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Card className="error-state">
      <AlertTriangle size={26} />
      <div>
        <strong>We couldn’t load this section</strong>
        <p>{message}</p>
      </div>
      <Button variant="secondary" onClick={retry}>
        <RefreshCw size={17} /> Retry
      </Button>
    </Card>
  );
}

export function DashboardOverview() {
  const { data, error, loading, reload } =
    useApi<DashboardData>("/api/dashboard");
  if (loading)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Overview"
          description="Your demo, from first upload to published AR."
        />
        <LoadingCards />
      </div>
    );
  if (error || !data)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Overview"
          description="Your demo, from first upload to published AR."
        />
        <ErrorCard message={error} retry={reload} />
      </div>
    );
  const metrics = [
    ["Products used", `${data.productsUsed}/${data.productLimit}`, ShoppingBag],
    ["Jobs queued", data.jobsQueued, Clock3],
    ["Models ready", data.modelsReady, Box],
    ["Approved", data.approvedProducts, CheckCircle2],
    ["AR experiences", data.arExperiences, ScanLine],
    ["QR codes", data.qrCodes, QrCode],
    ["QR scans", data.scans, Activity],
    ["Changes needed", data.changesRequested, AlertTriangle],
  ] as const;
  const journey = [
    {
      step: "01",
      label: "Add products",
      detail: `${data.productsUsed} of ${data.productLimit} product slots used`,
      complete: data.productsUsed > 0,
      href: "/dashboard/products",
      icon: ShoppingBag,
    },
    {
      step: "02",
      label: "Generate models",
      detail: `${data.modelsReady} draft model${data.modelsReady === 1 ? "" : "s"} ready`,
      complete: data.modelsReady > 0,
      href: "/dashboard/3d-generation",
      icon: Cuboid,
    },
    {
      step: "03",
      label: "Complete review",
      detail: `${data.approvedProducts} product${data.approvedProducts === 1 ? "" : "s"} approved`,
      complete: data.approvedProducts > 0,
      href: "/dashboard/approval-status",
      icon: FileCheck2,
    },
    {
      step: "04",
      label: "Launch AR + QR",
      detail: `${data.arExperiences} experience${data.arExperiences === 1 ? "" : "s"} · ${data.qrCodes} code${data.qrCodes === 1 ? "" : "s"}`,
      complete: data.arExperiences > 0 && data.qrCodes > 0,
      href: "/dashboard/ar-experiences",
      icon: ScanLine,
    },
  ] as const;
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Overview"
        description="Your demo, from first upload to published AR."
        action={
          <Link
            className="button button-primary"
            href="/dashboard/products/new"
          >
            <Plus size={18} /> Add product
          </Link>
        }
      />
      <div className="metric-grid">
        {metrics.map(([label, value, Icon]) => (
          <Card className="metric-card" key={label}>
            <span>
              <Icon
                size={15}
                style={{
                  display: "inline",
                  marginRight: 6,
                  verticalAlign: "-2px",
                }}
              />
              {label}
            </span>
            <strong>{value}</strong>
            <small>
              {label === "Products used"
                ? `${data.productLimit - data.productsUsed} remaining`
                : "Live workspace data"}
            </small>
          </Card>
        ))}
      </div>
      <Card className="journey-card">
        <div className="journey-head">
          <div>
            <span className="eyebrow">Demo flight path</span>
            <h2>From private photos to published AR</h2>
          </div>
          <span className="journey-limit">One demo · Five products</span>
        </div>
        <div className="journey-grid">
          {journey.map(({ step, label, detail, complete, href, icon: Icon }) => (
            <Link className={complete ? "journey-step is-complete" : "journey-step"} href={href} key={step}>
              <span className="journey-number">{complete ? <CheckCircle2 size={17} /> : step}</span>
              <span className="journey-icon"><Icon size={18} /></span>
              <span className="journey-copy"><strong>{label}</strong><small>{detail}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Card>
      <div className="content-grid two">
        <Card className="content-card">
          <div className="content-card-head">
            <div>
              <h2>Generation queue</h2>
              <p className="muted">
                Only one job per business processes at a time.
              </p>
            </div>
            <Link
              className="button button-secondary"
              href="/dashboard/3d-generation"
            >
              View queue
            </Link>
          </div>
          {data.currentJob ? (
            <div className="job-focus">
              <Badge tone="info">{humanStatus(data.currentJob.status)}</Badge>
              <Progress
                value={data.currentJob.progress}
                label={data.currentJob.currentStep}
              />
            </div>
          ) : (
            <div className="empty-state compact">
              <Cuboid size={30} />
              <strong>No job is processing</strong>
              <span>
                Queued work resumes automatically when the worker is online.
              </span>
            </div>
          )}
        </Card>
        <Card className="content-card">
          <div className="content-card-head">
            <div>
              <h2>Commercial status</h2>
              <p className="muted">Packages follow full demo approval.</p>
            </div>
          </div>
          <div className="status-stack">
            <Badge tone={data.packageStatus ? "info" : "neutral"}>
              {data.packageStatus
                ? humanStatus(data.packageStatus)
                : "Not created yet"}
            </Badge>
            <p>
              Your custom package is prepared after every submitted product is
              reviewed.
            </p>
            <Link href="/dashboard/custom-package">
              View package <ArrowRight size={15} />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <span className="eyebrow">B Socio AR workspace</span>
        <h1 className="page-title">{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

const sectionInfo: Record<
  string,
  { title: string; description: string; icon: typeof Box }
> = {
  business: {
    title: "Business",
    description: "Brand, contact and publishing identity.",
    icon: Building2,
  },
  demo: {
    title: "Demo project",
    description: "One focused project with up to five products.",
    icon: FolderKanban,
  },
  products: {
    title: "Products",
    description: "Manage every product and its complete AR workflow.",
    icon: ShoppingBag,
  },
  uploads: {
    title: "Uploads",
    description: "Private originals and supporting product views.",
    icon: Images,
  },
  "3d-generation": {
    title: "3D generation",
    description: "Real queue state and worker progress—without fake ETAs.",
    icon: Cuboid,
  },
  models: {
    title: "Models",
    description: "Open one private model preview at a time.",
    icon: Box,
  },
  "ar-experiences": {
    title: "AR experiences",
    description: "Draft experiences stay private until final approval.",
    icon: ScanLine,
  },
  "qr-codes": {
    title: "QR codes",
    description: "Dynamic codes keep an editable internal destination.",
    icon: QrCode,
  },
  "approval-status": {
    title: "Approval status",
    description: "See product decisions and customer-visible feedback.",
    icon: FileCheck2,
  },
  "custom-package": {
    title: "Custom package",
    description: "Your tailored commercial terms after demo approval.",
    icon: PackageCheck,
  },
  payments: {
    title: "Payments",
    description:
      "Submit a transaction reference and private proof for manual verification.",
    icon: CreditCard,
  },
  billing: {
    title: "Subscription & billing",
    description: "Plan, usage, renewal, invoices and request add-ons.",
    icon: CreditCard,
  },
  analytics: {
    title: "Analytics",
    description: "QR scans and AR opens for published experiences.",
    icon: Activity,
  },
  notifications: {
    title: "Notifications",
    description: "Decisions, requested changes and package updates.",
    icon: Bell,
  },
  support: {
    title: "Support",
    description: "Keep questions attached to your business workflow.",
    icon: CircleHelp,
  },
  profile: {
    title: "Profile",
    description: "Your personal customer account details.",
    icon: UserRound,
  },
  security: {
    title: "Security",
    description: "Password, sessions and account protection.",
    icon: ShieldCheck,
  },
  settings: {
    title: "Settings",
    description: "Locale and workspace preferences.",
    icon: Settings,
  },
};

export function CustomerSection({ section }: { section: string }) {
  const info = sectionInfo[section] ?? {
    title: "Workspace",
    description: "This workspace section is available from the navigation.",
    icon: Sparkles,
  };
  if (section === "products") return <ProductsSection />;
  if (section === "3d-generation") return <JobsSection section={section} />;
  if (section === "demo") return <DemoSection />;
  if (section === "business") return <BusinessSection />;
  if (section === "custom-package") return <PackagesSection />;
  if (section === "payments") return <PaymentsSection />;
  if (section === "billing") return <BillingDashboard />;
  if (section === "notifications")
    return (
      <RecordsSection
        info={info}
        endpoint="/api/notifications"
        empty="You are all caught up."
      />
    );
  if (section === "uploads")
    return (
      <RecordsSection
        info={info}
        endpoint="/api/uploads"
        empty="No private assets have been uploaded yet."
      />
    );
  if (section === "models")
    return (
      <RecordsSection
        info={info}
        endpoint="/api/models"
        empty="No generated model versions are available yet."
      />
    );
  if (section === "ar-experiences")
    return (
      <RecordsSection
        info={info}
        endpoint="/api/ar-experiences"
        empty="No draft AR experiences have been created yet."
      />
    );
  if (section === "qr-codes") return <QrCodesSection />;
  if (section === "support") return <SupportSection />;
  if (section === "profile") return <ProfileSection />;
  if (section === "security") return <SecuritySection />;
  if (section === "settings") return <AccountSettingsSection />;
  if (section === "approval-status")
    return (
      <RecordsSection
        info={info}
        endpoint="/api/approvals"
        empty="No administrator decisions have been recorded yet."
      />
    );
  if (section === "analytics")
    return (
      <RecordsSection
        info={info}
        endpoint="/api/analytics"
        empty="Analytics appear after published AR receives traffic."
      />
    );
  const Icon = info.icon;
  return (
    <div className="dashboard-page">
      <PageHeader title={info.title} description={info.description} />
      <Card className="empty-state">
        <Icon size={36} />
        <strong>{info.title} is ready for your live data</strong>
        <span>
          {section === "support"
            ? "Your support manager will respond here once a ticket is created."
            : "This section fills as your products move through the verified workflow."}
        </span>
      </Card>
    </div>
  );
}

interface AccountData {
  user: {
    fullName: string;
    email: string;
    country: string;
    countryCallingCode: string;
    mobileNumber: string;
    locale: string;
    timeZone: string;
    emailVerifiedAt?: string;
    lastLoginAt?: string;
    createdAt: string;
  };
}
interface SupportRecord {
  _id: string;
  subject: string;
  category: string;
  description: string;
  status: string;
  priority: string;
  adminResponse?: string;
  createdAt: string;
  updatedAt: string;
}

function SupportSection() {
  const state = useApi<{ items: SupportRecord[] }>("/api/support");
  const [form, setForm] = useState({
    subject: "",
    category: "OTHER",
    description: "",
    priority: "NORMAL",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await apiPost("/api/support", form);
      setForm({
        subject: "",
        category: "OTHER",
        description: "",
        priority: "NORMAL",
      });
      setMessage("Support request created.");
      await state.reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Support request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Support"
        description="Create a business-linked request and follow administrator responses."
      />
      <div className="content-grid two">
        <Card className="content-card">
          <h2>New support request</h2>
          <div className="form-grid">
            <label className="field form-span">
              <span className="field-label">Subject</span>
              <input
                className="input"
                value={form.subject}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    subject: event.target.value,
                  }))
                }
                maxLength={180}
              />
            </label>
            <label className="field">
              <span className="field-label">Category</span>
              <select
                className="input"
                value={form.category}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    category: event.target.value,
                  }))
                }
              >
                {[
                  "ACCOUNT",
                  "UPLOAD",
                  "3D_GENERATION",
                  "AR_QR",
                  "PACKAGE_PAYMENT",
                  "OTHER",
                ].map((value) => (
                  <option key={value} value={value}>
                    {humanStatus(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Priority</span>
              <select
                className="input"
                value={form.priority}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    priority: event.target.value,
                  }))
                }
              >
                {["NORMAL", "HIGH", "URGENT"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field form-span">
              <span className="field-label">What happened?</span>
              <textarea
                className="input"
                value={form.description}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    description: event.target.value,
                  }))
                }
                maxLength={5000}
              />
            </label>
          </div>
          {message ? (
            <div className="form-alert" role="status">
              {message}
            </div>
          ) : null}
          <Button
            onClick={submit}
            disabled={
              busy || form.subject.length < 3 || form.description.length < 10
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <CircleHelp size={17} />
            )}{" "}
            Create request
          </Button>
        </Card>
        <div>
          {state.loading ? (
            <Card className="skeleton-card large" />
          ) : state.error || !state.data ? (
            <ErrorCard message={state.error} retry={state.reload} />
          ) : state.data.items.length === 0 ? (
            <Card className="empty-state">
              <CircleHelp size={34} />
              <strong>No support requests</strong>
              <span>Create one with the form when you need help.</span>
            </Card>
          ) : (
            <div className="record-grid">
              {state.data.items.map((ticket) => (
                <Card className="content-card" key={ticket._id}>
                  <div className="record-title">
                    <strong>{ticket.subject}</strong>
                    <Badge
                      tone={
                        ticket.status === "RESOLVED" ? "success" : "warning"
                      }
                    >
                      {humanStatus(ticket.status)}
                    </Badge>
                  </div>
                  <p>{ticket.description}</p>
                  {ticket.adminResponse ? (
                    <div className="form-success">
                      <strong>B Socio response</strong>
                      <br />
                      {ticket.adminResponse}
                    </div>
                  ) : (
                    <small className="muted">
                      Awaiting a support response.
                    </small>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const state = useApi<AccountData>("/api/account");
  if (state.loading)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Profile"
          description="Your personal customer account details."
        />
        <Card className="skeleton-card large" />
      </div>
    );
  if (state.error || !state.data)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Profile"
          description="Your personal customer account details."
        />
        <ErrorCard message={state.error} retry={state.reload} />
      </div>
    );
  return <ProfileForm account={state.data} reload={state.reload} />;
}

function ProfileForm({
  account,
  reload,
}: {
  account: AccountData;
  reload: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    fullName: account.user.fullName,
    country: account.user.country,
    countryCallingCode: account.user.countryCallingCode,
    mobileNumber: account.user.mobileNumber,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await apiPost("/api/account/profile", form);
      setMessage("Profile saved.");
      await reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Profile update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Profile"
        description="Update the identity and contact details used by your workspace."
      />
      <Card className="content-card">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Full name</span>
            <input
              className="input"
              value={form.fullName}
              onChange={(event) =>
                setForm((value) => ({ ...value, fullName: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="field-label">Email (verified identity)</span>
            <input className="input" value={account.user.email} disabled />
          </label>
          <label className="field">
            <span className="field-label">Country</span>
            <input
              className="input"
              value={form.country}
              onChange={(event) =>
                setForm((value) => ({ ...value, country: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="field-label">Calling code</span>
            <input
              className="input"
              value={form.countryCallingCode}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  countryCallingCode: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span className="field-label">Mobile number</span>
            <input
              className="input"
              value={form.mobileNumber}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  mobileNumber: event.target.value,
                }))
              }
            />
          </label>
        </div>
        {message ? (
          <div className="form-alert" role="status">
            {message}
          </div>
        ) : null}
        <Button onClick={save} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <UserRound size={17} />
          )}{" "}
          Save profile
        </Button>
      </Card>
    </div>
  );
}

function SecuritySection() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function changePassword() {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiPost<{ message: string }>(
        "/api/account/password",
        form,
      );
      setForm({ currentPassword: "", newPassword: "" });
      setMessage(result.message);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Password change failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    try {
      await apiPost("/api/account/revoke-sessions", {});
      window.location.assign("/login?sessions-revoked=1");
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Session revocation failed.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Security"
        description="Change your password or invalidate every signed session."
      />
      <div className="content-grid two">
        <Card className="content-card">
          <h2>Change password</h2>
          <label className="field">
            <span className="field-label">Current password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  currentPassword: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span className="field-label">New password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  newPassword: event.target.value,
                }))
              }
            />
          </label>
          {message ? (
            <div className="form-alert" role="status">
              {message}
            </div>
          ) : null}
          <Button
            onClick={changePassword}
            disabled={
              busy || !form.currentPassword || form.newPassword.length < 12
            }
          >
            <ShieldCheck size={17} /> Change password
          </Button>
        </Card>
        <Card className="content-card">
          <h2>All active sessions</h2>
          <p>
            Signing out all sessions increments your server-side session
            version. Every existing cookie, including this one, becomes invalid
            immediately.
          </p>
          <Button variant="danger" onClick={revoke} disabled={busy}>
            Sign out all sessions
          </Button>
        </Card>
      </div>
    </div>
  );
}

function AccountSettingsSection() {
  const state = useApi<AccountData>("/api/account");
  if (state.loading)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Settings"
          description="Locale and workspace preferences."
        />
        <Card className="skeleton-card large" />
      </div>
    );
  if (state.error || !state.data)
    return (
      <div className="dashboard-page">
        <PageHeader
          title="Settings"
          description="Locale and workspace preferences."
        />
        <ErrorCard message={state.error} retry={state.reload} />
      </div>
    );
  return <AccountSettingsForm account={state.data} reload={state.reload} />;
}

function AccountSettingsForm({
  account,
  reload,
}: {
  account: AccountData;
  reload: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    locale: account.user.locale || "en",
    timeZone: account.user.timeZone || "UTC",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await apiPost("/api/account/settings", form);
      setMessage("Workspace preferences saved.");
      await reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Settings update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Settings"
        description="Store your locale and IANA time-zone preferences."
      />
      <Card className="content-card">
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Locale</span>
            <input
              className="input"
              value={form.locale}
              onChange={(event) =>
                setForm((value) => ({ ...value, locale: event.target.value }))
              }
              placeholder="en-US"
            />
          </label>
          <label className="field">
            <span className="field-label">Time zone</span>
            <input
              className="input"
              value={form.timeZone}
              onChange={(event) =>
                setForm((value) => ({ ...value, timeZone: event.target.value }))
              }
              placeholder="America/Los_Angeles"
            />
          </label>
        </div>
        {message ? (
          <div className="form-alert" role="status">
            {message}
          </div>
        ) : null}
        <Button onClick={save} disabled={busy}>
          <Settings size={17} /> Save settings
        </Button>
      </Card>
    </div>
  );
}

function ProductsSection() {
  const { data, error, loading, reload } = useApi<{
    items: ProductRecord[];
    total: number;
    limit: number;
  }>("/api/products");
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Products"
        description="Each product carries its own images, model, AR, QR, review and analytics."
        action={
          <Link
            className="button button-primary"
            href="/dashboard/products/new"
          >
            <Plus size={18} /> Add product
          </Link>
        }
      />
      {loading ? (
        <LoadingCards />
      ) : error || !data ? (
        <ErrorCard message={error} retry={reload} />
      ) : data.items.length === 0 ? (
        <Card className="empty-state">
          <ShoppingBag size={36} />
          <strong>No products yet</strong>
          <span>
            Add your first product to start the private upload and 3D workflow.
          </span>
          <Link
            className="button button-primary"
            href="/dashboard/products/new"
          >
            Add first product
          </Link>
        </Card>
      ) : (
        <div className="record-grid">
          {data.items.map((product) => (
            <Link
              className="card record-card"
              href={`/dashboard/products/${product._id}`}
              key={product._id}
            >
              <div className="record-icon">
                <ShoppingBag size={22} />
              </div>
              <div className="record-copy">
                <div className="record-title">
                  <strong>{product.name}</strong>
                  <Badge tone={statusTone(product.approvalStatus)}>
                    {humanStatus(product.approvalStatus)}
                  </Badge>
                </div>
                <span>{product.category}</span>
                <p>{product.description}</p>
              </div>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      )}
      <p className="section-footnote">
        {data ? `${data.total} of ${data.limit} demo product slots used.` : ""}
      </p>
    </div>
  );
}

function JobsSection({ section }: { section: string }) {
  const info = sectionInfo[section] ?? sectionInfo["3d-generation"]!;
  const { data, error, loading, reload } = useApi<{ items: JobRecord[] }>(
    "/api/jobs",
  );
  return (
    <div className="dashboard-page">
      <PageHeader title={info.title} description={info.description} />
      {loading ? (
        <LoadingCards />
      ) : error || !data ? (
        <ErrorCard message={error} retry={reload} />
      ) : data.items.length === 0 ? (
        <Card className="empty-state">
          <Cuboid size={36} />
          <strong>No 3D jobs yet</strong>
          <span>
            Open a product, upload its main image, then create a generation job.
          </span>
          <Link className="button button-primary" href="/dashboard/products">
            Choose a product
          </Link>
        </Card>
      ) : (
        <div className="record-grid">
          {data.items.map((job) => (
            <Card className="job-card" key={job._id}>
              <div className="record-title">
                <Badge tone={statusTone(job.status)}>
                  {humanStatus(job.status)}
                </Badge>
                <small>{new Date(job.updatedAt).toLocaleString()}</small>
              </div>
              <Progress value={job.progress} label={job.currentStep} />
              {job.customerSafeError ? (
                <p className="field-error">{job.customerSafeError}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoSection() {
  const { data, error, loading, reload } = useApi<{
    demo: { _id: string; name: string; status: string } | null;
  }>("/api/demo");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(kind: "create" | "submit") {
    setBusy(true);
    setMessage("");
    try {
      await apiPost(
        kind === "create" ? "/api/demo" : "/api/demo/submit",
        kind === "create" ? { name: "My product AR demo" } : {},
      );
      setMessage(
        kind === "create"
          ? "Demo project created."
          : "Demo submitted for administrator review.",
      );
      await reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Demo project"
        description="One focused project with up to five products."
      />
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorCard message={error} retry={reload} />
      ) : (
        <Card className="content-card">
          {data?.demo ? (
            <>
              <div className="content-card-head">
                <div>
                  <h2>{data.demo.name}</h2>
                  <p className="muted">
                    All products must be ready before submission.
                  </p>
                </div>
                <Badge tone={statusTone(data.demo.status)}>
                  {humanStatus(data.demo.status)}
                </Badge>
              </div>
              <Button
                onClick={() => action("submit")}
                disabled={busy || data.demo.status === "READY_FOR_REVIEW"}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <FileCheck2 size={18} />
                )}{" "}
                Submit complete demo
              </Button>
            </>
          ) : (
            <div className="empty-state">
              <FolderKanban size={36} />
              <strong>Create your one demo project</strong>
              <span>
                Complete onboarding first, then add up to five products.
              </span>
              <Button onClick={() => action("create")} disabled={busy}>
                {busy ? "Creating…" : "Create demo project"}
              </Button>
            </div>
          )}
          {message ? (
            <p className="form-alert" role="status">
              {message}
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function BusinessSection() {
  const { data, error, loading, reload } = useApi<{
    business: {
      name: string;
      category: string;
      country: string;
      slug: string;
      onboardingComplete: boolean;
    } | null;
  }>("/api/business");
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Business"
        description="Brand, contact and publishing identity."
        action={
          <Link className="button button-primary" href="/onboarding">
            Edit business
          </Link>
        }
      />
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorCard message={error} retry={reload} />
      ) : data?.business ? (
        <Card className="business-card">
          <div className="record-icon">
            <Building2 size={24} />
          </div>
          <div>
            <h2>{data.business.name}</h2>
            <p>
              {data.business.category} · {data.business.country}
            </p>
            <span className="muted">
              AR URL: /ar/{data.business.slug}/product
            </span>
          </div>
          <Badge
            tone={data.business.onboardingComplete ? "success" : "warning"}
          >
            {data.business.onboardingComplete
              ? "Onboarding complete"
              : "Needs details"}
          </Badge>
        </Card>
      ) : (
        <Card className="empty-state">
          <Building2 size={36} />
          <strong>Complete business onboarding</strong>
          <Link className="button button-primary" href="/onboarding">
            Start onboarding
          </Link>
        </Card>
      )}
    </div>
  );
}

function PackagesSection() {
  const state = useApi<{ items: PackageRecord[] }>("/api/packages");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function accept(packageId: string) {
    setBusy(packageId);
    setMessage("");
    try {
      await apiPost("/api/packages/accept", { packageId });
      setMessage("Package accepted. You can now submit payment details.");
      await state.reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Package acceptance failed.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Custom package"
        description="Tailored commercial terms created only after complete demo approval."
      />
      {message ? (
        <div className="form-alert" role="status">
          {message}
        </div>
      ) : null}
      {state.loading ? (
        <LoadingCards />
      ) : state.error || !state.data ? (
        <ErrorCard message={state.error} retry={state.reload} />
      ) : state.data.items.length === 0 ? (
        <Card className="empty-state">
          <PackageCheck size={36} />
          <strong>No custom package has been offered yet.</strong>
          <span>
            B Socio prepares one after every submitted product is approved.
          </span>
        </Card>
      ) : (
        <div className="record-grid">
          {state.data.items.map((item) => (
            <Card className="content-card" key={item._id}>
              <div className="content-card-head">
                <div>
                  <h2>{item.name}</h2>
                  <p className="muted">
                    Valid until {new Date(item.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone={statusTone(item.status)}>
                  {humanStatus(item.status)}
                </Badge>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Setup fee</dt>
                  <dd>
                    {item.currency} {item.setupFee.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Recurring</dt>
                  <dd>
                    {item.monthlyFee
                      ? `${item.currency} ${item.monthlyFee.toLocaleString()} monthly`
                      : item.annualFee
                        ? `${item.currency} ${item.annualFee.toLocaleString()} annually`
                        : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Products / AR / QR</dt>
                  <dd>
                    {item.productLimit} / {item.arLimit} / {item.qrLimit}
                  </dd>
                </div>
                <div>
                  <dt>Storage / traffic</dt>
                  <dd>
                    {item.storageGb} GB / {item.trafficGb} GB
                  </dd>
                </div>
                <div>
                  <dt>Support</dt>
                  <dd>{item.supportLevel}</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>{item.deliveryTimeline}</dd>
                </div>
              </dl>
              <div className="status-stack">
                <strong>Custom terms</strong>
                <p>{item.customTerms}</p>
                <small className="muted">Renewal: {item.renewalRules}</small>
              </div>
              {item.status === "OFFERED" ? (
                <Button
                  onClick={() => accept(item._id)}
                  disabled={Boolean(busy)}
                >
                  {busy === item._id ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}{" "}
                  Accept package
                </Button>
              ) : item.status === "ACCEPTED" ? (
                <Link
                  className="button button-primary"
                  href="/dashboard/payments"
                >
                  Continue to payment
                </Link>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface QrRecord {
  _id: string;
  productId: string;
  uniqueCode: string;
  destinationPath: string;
  foreground: string;
  background: string;
  errorCorrectionLevel: "L" | "M" | "Q" | "H";
  size: number;
  callToAction: string;
  scans: number;
  active: boolean;
}

function QrEditor({
  item,
  reload,
}: {
  item: QrRecord;
  reload: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    destinationPath: item.destinationPath,
    foreground: item.foreground,
    background: item.background,
    errorCorrectionLevel: item.errorCorrectionLevel,
    size: String(item.size),
    callToAction: item.callToAction,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await apiPost("/api/qr-codes/update", {
        productId: item.productId,
        destinationPath: form.destinationPath,
        foreground: form.foreground,
        background: form.background,
        errorCorrectionLevel: form.errorCorrectionLevel,
        size: Number(form.size),
        callToAction: form.callToAction,
      });
      setMessage(
        "Dynamic QR settings saved. The unique printed code remains unchanged.",
      );
      await reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "QR update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="content-card">
      <div className="content-card-head">
        <div>
          <h2>{form.callToAction}</h2>
          <p className="muted">
            {item.scans} scans ·{" "}
            {item.active ? "live redirect" : "draft and inactive"}
          </p>
        </div>
        <Badge tone={item.active ? "success" : "warning"}>
          {item.active ? "Live" : "Draft"}
        </Badge>
      </div>
      <Image
        className="qr-preview"
        src={`/api/qr/${item.uniqueCode}/svg`}
        alt={`Dynamic QR ${item.uniqueCode}`}
        width={360}
        height={360}
        unoptimized
      />
      <div className="form-grid">
        <label className="field form-span">
          <span className="field-label">Internal AR destination</span>
          <input
            className="input"
            value={form.destinationPath}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                destinationPath: event.target.value,
              }))
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Foreground</span>
          <input
            className="input"
            type="color"
            value={form.foreground}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                foreground: event.target.value,
              }))
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Background</span>
          <input
            className="input"
            type="color"
            value={form.background}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                background: event.target.value,
              }))
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Error correction</span>
          <select
            className="input"
            value={form.errorCorrectionLevel}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                errorCorrectionLevel: event.target
                  .value as QrRecord["errorCorrectionLevel"],
              }))
            }
          >
            {["L", "M", "Q", "H"].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Output size</span>
          <input
            className="input"
            type="number"
            min={256}
            max={2048}
            value={form.size}
            onChange={(event) =>
              setForm((current) => ({ ...current, size: event.target.value }))
            }
          />
        </label>
        <label className="field form-span">
          <span className="field-label">Call to action</span>
          <input
            className="input"
            value={form.callToAction}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                callToAction: event.target.value,
              }))
            }
            maxLength={80}
          />
        </label>
      </div>
      {message ? (
        <div className="form-alert" role="status">
          {message}
        </div>
      ) : null}
      <div className="review-actions">
        <Button onClick={save} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <QrCode size={17} />
          )}{" "}
          Save QR settings
        </Button>
        <a
          className="button button-secondary"
          href={`/api/qr/${item.uniqueCode}/png`}
          download={`bsocio-${item.uniqueCode}.png`}
        >
          PNG
        </a>
        <a
          className="button button-secondary"
          href={`/api/qr/${item.uniqueCode}/transparent`}
          download={`bsocio-${item.uniqueCode}-transparent.png`}
        >
          Transparent PNG
        </a>
        <a
          className="button button-secondary"
          href={`/api/qr/${item.uniqueCode}/svg`}
          download={`bsocio-${item.uniqueCode}.svg`}
        >
          Download SVG
        </a>
        <a
          className="button button-secondary"
          href={`/api/qr/${item.uniqueCode}/print`}
          download={`bsocio-${item.uniqueCode}-print.png`}
        >
          Print PNG
        </a>
        {item.active ? (
          <Link
            className="button button-primary"
            href={`/q/product/${item.uniqueCode}`}
          >
            Test live code
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function QrCodesSection() {
  const state = useApi<{ items: QrRecord[] }>("/api/qr-codes");
  return (
    <div className="dashboard-page">
      <PageHeader
        title="QR codes"
        description="Style dynamic codes and keep their internal AR destination editable without changing the printed code."
      />
      {state.loading ? (
        <LoadingCards />
      ) : state.error || !state.data ? (
        <ErrorCard message={state.error} retry={state.reload} />
      ) : state.data.items.length === 0 ? (
        <Card className="empty-state">
          <QrCode size={36} />
          <strong>No dynamic QR codes have been created yet.</strong>
          <span>One is generated automatically for each successful model.</span>
        </Card>
      ) : (
        <div className="record-grid">
          {state.data.items.map((item) => (
            <QrEditor item={item} reload={state.reload} key={item._id} />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentsSection() {
  const packages = useApi<{ items: PackageRecord[] }>("/api/packages");
  const payments = useApi<{ items: PaymentRecord[] }>("/api/payments");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proofAssetId, setProofAssetId] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const accepted = packages.data?.items.find(
    (item) => item.status === "ACCEPTED",
  );
  async function checksum(selected: File) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await selected.arrayBuffer(),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  function put(url: string, selected: File, headers: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      Object.entries(headers).forEach(([key, value]) =>
        xhr.setRequestHeader(key, value),
      );
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () =>
        reject(
          new Error(
            "The private proof upload was interrupted. Your payment details remain on this page.",
          ),
        );
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(
              new Error(
                `Private proof upload failed with status ${xhr.status}.`,
              ),
            );
      xhr.send(selected);
    });
  }
  async function uploadProof() {
    if (!file || !accepted) return;
    setBusy(true);
    setError("");
    setMessage("");
    setProgress(1);
    try {
      const sha = await checksum(file);
      const signed = await apiPost<{
        assetId: string;
        url: string;
        requiredHeaders: Record<string, string>;
      }>("/api/uploads/sign", {
        packageId: accepted._id,
        assetType: "PAYMENT_PROOF",
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        checksumSha256: sha,
      });
      await put(signed.url, file, signed.requiredHeaders);
      await apiPost("/api/uploads/confirm", {
        assetId: signed.assetId,
        checksumSha256: sha,
      });
      setProofAssetId(signed.assetId);
      setMessage("Payment proof uploaded privately and validated.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Proof upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submitPayment() {
    if (!accepted || !proofAssetId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiPost("/api/payments", {
        packageId: accepted._id,
        method,
        transactionReference: reference,
        proofAssetId,
        customerNotes: notes || undefined,
      });
      setMessage("Payment submitted for manual verification.");
      setReference("");
      setNotes("");
      setFile(null);
      setProofAssetId("");
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
      await payments.reload();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Payment submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const loading = packages.loading || payments.loading;
  const loadError = packages.error || payments.error;
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Payments"
        description="Manual verification keeps activation gated until B Socio confirms receipt."
      />
      {loading ? (
        <LoadingCards />
      ) : loadError ? (
        <ErrorCard
          message={loadError}
          retry={async () => {
            await Promise.all([packages.reload(), payments.reload()]);
          }}
        />
      ) : (
        <>
          <Card className="content-card">
            <div className="content-card-head">
              <div>
                <h2>Submit payment</h2>
                <p className="muted">
                  Payment proof stays private and is exposed to authorized
                  finance reviewers only through a short-lived link.
                </p>
              </div>
              {accepted ? (
                <Badge tone="success">Package accepted</Badge>
              ) : (
                <Badge tone="warning">Package required</Badge>
              )}
            </div>
            {accepted ? (
              <>
                <div className="status-stack">
                  <strong>Payment instructions</strong>
                  <p>
                    Use the payment instructions supplied by B Socio for{" "}
                    {accepted.name}, then enter the exact bank, UPI or offline
                    confirmation reference below.
                  </p>
                  <small className="muted">
                    Amount: {accepted.currency}{" "}
                    {accepted.setupFee.toLocaleString()} plus applicable tax,
                    less any stated discount.
                  </small>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Payment method</span>
                    <select
                      className="input"
                      value={method}
                      onChange={(event) => setMethod(event.target.value)}
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="OFFLINE">Offline confirmation</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Transaction reference</span>
                    <input
                      className="input"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      minLength={3}
                      maxLength={160}
                      autoComplete="off"
                      required
                    />
                  </label>
                  <label className="field form-span">
                    <span className="field-label">
                      Customer notes (optional)
                    </span>
                    <textarea
                      className="input textarea"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={2000}
                    />
                  </label>
                </div>
                <label className="file-drop">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setProofAssetId("");
                      setProgress(0);
                    }}
                  />
                  <UploadCloud size={24} />
                  <span>{file ? file.name : "Choose payment proof"}</span>
                  <small>JPG, PNG, WebP or PDF · up to 15 MB</small>
                </label>
                {busy && progress > 0 && progress < 100 ? (
                  <Progress
                    value={progress}
                    label="Uploading proof directly to private storage"
                  />
                ) : null}
                {error ? (
                  <div className="form-alert" role="alert">
                    {error}
                  </div>
                ) : null}
                {message ? (
                  <div className="form-success" role="status">
                    {message}
                  </div>
                ) : null}
                <div className="upload-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={uploadProof}
                    disabled={!file || busy}
                  >
                    {busy && !proofAssetId ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <UploadCloud size={18} />
                    )}{" "}
                    {proofAssetId ? "Proof validated" : "Upload proof"}
                  </Button>
                  <Button
                    type="button"
                    onClick={submitPayment}
                    disabled={
                      !proofAssetId || reference.trim().length < 3 || busy
                    }
                  >
                    <CreditCard size={18} /> Submit for verification
                  </Button>
                </div>
              </>
            ) : (
              <div className="empty-state compact">
                <PackageCheck size={30} />
                <strong>Accept your custom package first</strong>
                <Link
                  className="button button-primary"
                  href="/dashboard/custom-package"
                >
                  Review package
                </Link>
              </div>
            )}
          </Card>
          <div className="record-grid">
            {payments.data?.items.map((item) => (
              <Card className="content-card" key={item._id}>
                <div className="record-title">
                  <strong>{item.transactionReference}</strong>
                  <Badge tone={statusTone(item.status)}>
                    {humanStatus(item.status)}
                  </Badge>
                </div>
                <p>
                  {humanStatus(item.method)} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                {item.adminNotes ? (
                  <p className="form-alert">Finance note: {item.adminNotes}</p>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RecordsSection({
  info,
  endpoint,
  empty,
}: {
  info: { title: string; description: string; icon: typeof Box };
  endpoint: string;
  empty: string;
}) {
  const { data, error, loading, reload } = useApi<{
    items: Array<Record<string, unknown>>;
    summary?: { qrScans?: number; arOpens?: number };
  }>(endpoint);
  const Icon = info.icon;
  return (
    <div className="dashboard-page">
      <PageHeader title={info.title} description={info.description} />
      {loading ? (
        <LoadingCards />
      ) : error || !data ? (
        <ErrorCard message={error} retry={reload} />
      ) : (
        <>
          {data.summary ? (
            <div className="metric-grid">
              <Card className="metric-card">
                <span>QR scans</span>
                <strong>{data.summary.qrScans ?? 0}</strong>
                <small>Verified redirect events</small>
              </Card>
              <Card className="metric-card">
                <span>AR opens</span>
                <strong>{data.summary.arOpens ?? 0}</strong>
                <small>Published experience opens</small>
              </Card>
            </div>
          ) : null}
          {data.items.length === 0 ? (
            <Card className="empty-state">
              <Icon size={36} />
              <strong>{empty}</strong>
            </Card>
          ) : (
            <div className="record-grid">
              {data.items.map((item, index) => {
                const title = String(
                  item.productName ??
                    item.title ??
                    item.name ??
                    item.transactionReference ??
                    item.originalName ??
                    item.uniqueCode ??
                    item.assetType ??
                    item.decision ??
                    item.eventType ??
                    info.title,
                );
                const status = item.status ?? item.decision;
                const detail =
                  item.message ??
                  item.customerFeedback ??
                  item.currentStep ??
                  item.draftSlug ??
                  item.destinationPath ??
                  item.assetType ??
                  (item.version ? `Model version ${item.version}` : undefined);
                return (
                  <Card
                    className="content-card"
                    key={String(item._id ?? index)}
                  >
                    <div className="record-title">
                      <strong>{title}</strong>
                      {status ? (
                        <Badge tone={statusTone(String(status))}>
                          {humanStatus(String(status))}
                        </Badge>
                      ) : null}
                    </div>
                    {detail ? <p>{String(detail)}</p> : null}
                    {typeof item.size === "number" ? (
                      <small className="muted">
                        {(item.size / 1_048_576).toFixed(1)} MB ·{" "}
                        {String(item.mimeType ?? "asset")}
                      </small>
                    ) : null}
                    {item.uniqueCode ? (
                      <Image
                        className="qr-preview"
                        src={`/api/qr/${String(item.uniqueCode)}/svg`}
                        alt={`Dynamic QR ${String(item.uniqueCode)}`}
                        width={320}
                        height={320}
                        unoptimized
                      />
                    ) : null}
                    <div className="review-actions">
                      {item.productId ? (
                        <Link
                          className="button button-secondary"
                          href={`/dashboard/products/${String(item.productId)}`}
                        >
                          Open product
                        </Link>
                      ) : null}
                      {item.publicSlug && item.status === "PUBLISHED" ? (
                        <Link
                          className="button button-primary"
                          href={`/ar/${String(item.publicSlug)}`}
                        >
                          Open live AR
                        </Link>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
