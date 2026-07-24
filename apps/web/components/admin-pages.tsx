"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Box,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  HeartPulse,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge, Button, Card } from "@bsocio/ui";
import { apiPost, useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/dashboard-pages";
import { PackageBuilder, PaymentReview } from "@/components/admin-commercial";
import { CustomerAccounts, TeamMembers } from "@/components/admin-access";
import { AdminBillingDashboard } from "@/components/billing-pages";

interface WorkerHealth {
  online: boolean;
  lastHeartbeat?: string;
  currentJobId?: string;
  queueLength: number;
  deviceType?: string;
  workerVersion?: string;
}
interface ReviewProduct {
  _id: string;
  name: string;
  category: string;
  approvalStatus: string;
  businessId: string;
  updatedAt: string;
}
const human = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

function AdminError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <Card className="error-state">
      <AlertTriangle size={24} />
      <div>
        <strong>Operational data unavailable</strong>
        <p>{message}</p>
      </div>
      <Button variant="secondary" onClick={retry}>
        <RefreshCw size={17} /> Retry
      </Button>
    </Card>
  );
}

export function AdminOverview() {
  const session = useApi<{ user: { role: string } }>("/api/auth/session");
  const worker = useApi<WorkerHealth>("/api/admin/worker-health");
  const reviews = useApi<{ items: ReviewProduct[] }>("/api/admin/review-queue");
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Administrator overview"
        description="Review quality, queue health, payments and publishing gates."
        action={session.data && ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER"].includes(session.data.user.role) ? (
          <Link className="button button-primary" href="/admin/approval-queue">
            Open approval queue
          </Link>
        ) : undefined}
      />
      <div className="metric-grid">
        <Card className="metric-card">
          <span>
            <FileCheck2 size={15} /> Pending review
          </span>
          <strong>{reviews.data?.items.length ?? "—"}</strong>
          <small>Submitted products</small>
        </Card>
        <Card className="metric-card">
          <span>
            <Clock3 size={15} /> Jobs queued
          </span>
          <strong>{worker.data?.queueLength ?? "—"}</strong>
          <small>Sequential processing</small>
        </Card>
        <Card className="metric-card">
          <span>
            <HeartPulse size={15} /> Worker
          </span>
          <strong className="metric-word">
            {worker.data ? (worker.data.online ? "Online" : "Offline") : "—"}
          </strong>
          <small>
            {worker.data?.deviceType
              ? `${worker.data.deviceType.toUpperCase()} · ${worker.data.workerVersion ?? "version unknown"}`
              : "Awaiting heartbeat"}
          </small>
        </Card>
        <Card className="metric-card">
          <span>
            <ShieldCheck size={15} /> Release policy
          </span>
          <strong className="metric-word">Gated</strong>
          <small>Review + payment + final approval</small>
        </Card>
      </div>
      <div className="content-grid two">
        <Card className="content-card">
          <div className="content-card-head">
            <div>
              <h2>Approval queue</h2>
              <p className="muted">Products are reviewed individually.</p>
            </div>
          </div>
          {reviews.error ? (
            <AdminError message={reviews.error} retry={reviews.reload} />
          ) : reviews.loading ? (
            <div className="skeleton-card" />
          ) : reviews.data?.items.length ? (
            <div className="admin-list">
              {reviews.data.items.slice(0, 5).map((item) => (
                <Link href="/admin/approval-queue" key={item._id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                  </span>
                  <Badge tone="warning">{human(item.approvalStatus)}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <CheckCircle2 size={30} />
              <strong>Review queue is clear</strong>
            </div>
          )}
        </Card>
        <Card className="content-card">
          <div className="content-card-head">
            <div>
              <h2>Worker health</h2>
              <p className="muted">Offline workers leave jobs safely queued.</p>
            </div>
            {worker.data ? (
              <Badge tone={worker.data.online ? "success" : "warning"}>
                {worker.data.online ? "Online" : "Offline"}
              </Badge>
            ) : null}
          </div>
          {worker.error ? (
            <AdminError message={worker.error} retry={worker.reload} />
          ) : (
            <dl className="health-list">
              <div>
                <dt>Last heartbeat</dt>
                <dd>
                  {worker.data?.lastHeartbeat
                    ? new Date(worker.data.lastHeartbeat).toLocaleString()
                    : "No heartbeat"}
                </dd>
              </div>
              <div>
                <dt>Current job</dt>
                <dd>{worker.data?.currentJobId ?? "Idle"}</dd>
              </div>
              <div>
                <dt>Queue</dt>
                <dd>{worker.data?.queueLength ?? "—"}</dd>
              </div>
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}

const adminInfo: Record<
  string,
  { title: string; description: string; icon: typeof Box }
> = {
  customers: {
    title: "Customers",
    description: "Customer accounts, suspension and ownership context.",
    icon: UsersRound,
  },
  businesses: {
    title: "Businesses",
    description: "Tenant businesses and demo usage.",
    icon: Building2,
  },
  "demo-projects": {
    title: "Demo projects",
    description: "Submission and complete-demo approval state.",
    icon: FileCheck2,
  },
  products: {
    title: "Products",
    description: "Individual product quality and versions.",
    icon: Box,
  },
  uploads: {
    title: "Uploads",
    description: "Private asset metadata and validation outcomes.",
    icon: Activity,
  },
  "job-queue": {
    title: "3D job queue",
    description: "Atomic locks, attempts, progress and safe errors.",
    icon: Clock3,
  },
  models: {
    title: "Models",
    description: "GLB outputs, warnings, versions and replacements.",
    icon: Box,
  },
  "ar-experiences": {
    title: "AR experiences",
    description: "Draft, production-approved and published experiences.",
    icon: Activity,
  },
  "qr-codes": {
    title: "QR codes",
    description: "Dynamic destinations, styles and scan totals.",
    icon: Activity,
  },
  "approval-queue": {
    title: "Approval queue",
    description:
      "Review every submitted product before complete demo approval.",
    icon: FileCheck2,
  },
  packages: {
    title: "Packages",
    description: "Tailored commercial offers—no fixed public pricing.",
    icon: PackageCheck,
  },
  payments: {
    title: "Payments",
    description: "Manual proof review and verification decisions.",
    icon: Activity,
  },
  billing: {
    title: "Subscription operations",
    description: "Plans, recurring revenue, renewals, usage and payment risk.",
    icon: PackageCheck,
  },
  "team-members": {
    title: "Team members",
    description: "Least-privilege administrator roles.",
    icon: UsersRound,
  },
  support: {
    title: "Support",
    description: "Customer-visible and internal support context.",
    icon: Activity,
  },
  analytics: {
    title: "Analytics",
    description: "Published QR scans and AR opens.",
    icon: Activity,
  },
  "worker-health": {
    title: "Worker health",
    description: "Heartbeat, current job, queue, device and version.",
    icon: HeartPulse,
  },
  "storage-usage": {
    title: "Storage usage",
    description: "Private and approved-public object metadata.",
    icon: Activity,
  },
  "audit-logs": {
    title: "Audit logs",
    description: "Sensitive decisions and authentication events.",
    icon: ShieldCheck,
  },
  settings: {
    title: "Settings",
    description: "Platform limits and operational configuration.",
    icon: Activity,
  },
};

export function AdminSection({ section }: { section: string }) {
  if (section === "approval-queue") return <ApprovalQueue />;
  if (section === "worker-health") return <WorkerHealthPage />;
  if (section === "payments") return <PaymentReview />;
  if (section === "packages") return <PackageBuilder />;
  if (section === "billing") return <AdminBillingDashboard />;
  if (section === "customers") return <CustomerAccounts />;
  if (section === "team-members") return <TeamMembers />;
  if (section === "support") return <AdminSupport />;
  if (section === "settings") return <AdminSettings />;
  if (
    [
      "customers",
      "businesses",
      "demo-projects",
      "products",
      "uploads",
      "job-queue",
      "models",
      "ar-experiences",
      "qr-codes",
      "team-members",
      "analytics",
      "storage-usage",
      "audit-logs",
    ].includes(section)
  )
    return <AdminDataRecords section={section} />;
  const info = adminInfo[section] ?? {
    title: "Operations",
    description: "Protected administrator workspace.",
    icon: ShieldCheck,
  };
  const Icon = info.icon;
  return (
    <div className="dashboard-page">
      <PageHeader title={info.title} description={info.description} />
      <Card className="empty-state">
        <Icon size={38} />
        <strong>No matching operational records</strong>
        <span>
          This protected view populates from live database records; sample
          customer data is never fabricated.
        </span>
      </Card>
    </div>
  );
}

interface SupportTicketRecord { _id: string; subject: string; category: string; description: string; status: string; priority: string; adminResponse?: string; updatedAt: string }

function AdminSupport() {
  const state = useApi<{ items: SupportTicketRecord[] }>("/api/admin/support");
  return <div className="dashboard-page"><PageHeader title="Support" description="Respond to customer-visible business support requests." />{state.loading ? <Card className="skeleton-card large" /> : state.error || !state.data ? <AdminError message={state.error} retry={state.reload} /> : state.data.items.length === 0 ? <Card className="empty-state"><CheckCircle2 size={38} /><strong>No support requests</strong></Card> : <div className="review-grid">{state.data.items.map((ticket) => <SupportTicketCard key={ticket._id} ticket={ticket} reload={state.reload} />)}</div>}</div>;
}

function SupportTicketCard({ ticket, reload }: { ticket: SupportTicketRecord; reload: () => Promise<void> }) {
  const [response, setResponse] = useState(ticket.adminResponse ?? ""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function respond(status: "WAITING_CUSTOMER" | "RESOLVED") { setBusy(true); setMessage(""); try { await apiPost("/api/admin/support/respond", { ticketId: ticket._id, response, status }); setMessage("Customer-visible response saved."); await reload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Support response failed."); } finally { setBusy(false); } }
  return <Card className="content-card"><div className="record-title"><span><strong>{ticket.subject}</strong><small>{human(ticket.category)} · {human(ticket.priority)}</small></span><Badge tone={ticket.status === "RESOLVED" ? "success" : "warning"}>{human(ticket.status)}</Badge></div><p>{ticket.description}</p><label className="field"><span className="field-label">Customer-visible response</span><textarea className="input" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={5000} disabled={ticket.status === "RESOLVED"} /></label>{message ? <div className="form-alert" role="status">{message}</div> : null}{ticket.status !== "RESOLVED" ? <div className="review-actions"><Button variant="secondary" onClick={() => respond("WAITING_CUSTOMER")} disabled={busy || response.length < 3}>Send response</Button><Button onClick={() => respond("RESOLVED")} disabled={busy || response.length < 3}><CheckCircle2 size={17} /> Resolve</Button></div> : null}</Card>;
}

function AdminSettings() {
  const state = useApi<{ limits: Record<string, number>; uploads: Record<string, number>; mode: string; demoMode: boolean }>("/api/admin/settings");
  return <div className="dashboard-page"><PageHeader title="Settings" description="Read-only effective production limits; change them through reviewed environment configuration." />{state.loading ? <Card className="skeleton-card large" /> : state.error || !state.data ? <AdminError message={state.error} retry={state.reload} /> : <div className="content-grid two"><Card className="content-card"><h2>Demo limits</h2><dl className="health-list">{Object.entries(state.data.limits).map(([key, value]) => <div key={key}><dt>{human(key)}</dt><dd>{value}</dd></div>)}</dl></Card><Card className="content-card"><h2>Runtime policy</h2><dl className="health-list">{Object.entries(state.data.uploads).map(([key, value]) => <div key={key}><dt>{human(key)}</dt><dd>{value}</dd></div>)}<div><dt>Mode</dt><dd>{state.data.mode}</dd></div><div><dt>Demo token mode</dt><dd>{state.data.demoMode ? "Enabled" : "Disabled"}</dd></div></dl></Card></div>}</div>;
}

function AdminDataRecords({ section }: { section: string }) {
  const info = adminInfo[section] ?? {
    title: "Operations",
    description: "Protected administrator records.",
    icon: ShieldCheck,
  };
  const Icon = info.icon;
  const state = useApi<{ items: Array<Record<string, unknown>> }>(
    `/api/admin/records/${section}`,
  );
  return (
    <div className="dashboard-page">
      <PageHeader title={info.title} description={info.description} />
      {state.loading ? (
        <Card className="skeleton-card large" />
      ) : state.error || !state.data ? (
        <AdminError message={state.error} retry={state.reload} />
      ) : state.data.items.length === 0 ? (
        <Card className="empty-state">
          <Icon size={38} />
          <strong>No matching operational records</strong>
        </Card>
      ) : (
        <div className="review-grid">
          {state.data.items.map((item, index) => {
            const title = String(
              item.fullName ??
                item.name ??
                item.title ??
                item.action ??
                item.uniqueCode ??
                item.originalName ??
                item.assetType ??
                `Record ${index + 1}`,
            );
            const status =
              item.status ??
              item.approvalStatus ??
              item.role ??
              (item.success === false ? "FAILED" : undefined);
            const detail =
              item.email ??
              item.message ??
              item.currentStep ??
              item.entityType ??
              item.destinationPath ??
              item.slug ??
              item.category;
            return (
              <Card className="content-card" key={String(item._id ?? index)}>
                <div className="record-title">
                  <strong>{title}</strong>
                  {status ? (
                    <Badge
                      tone={
                        String(status).includes("FAILED") ||
                        String(status).includes("REJECTED")
                          ? "danger"
                          : "info"
                      }
                    >
                      {human(String(status))}
                    </Badge>
                  ) : null}
                </div>
                {detail ? <p>{String(detail)}</p> : null}
                <div className="detail-grid">
                  {item.progress !== undefined ? (
                    <div>
                      <dt>Progress</dt>
                      <dd>{String(item.progress)}%</dd>
                    </div>
                  ) : null}
                  {item.size !== undefined ? (
                    <div>
                      <dt>Size</dt>
                      <dd>{(Number(item.size) / 1_048_576).toFixed(1)} MB</dd>
                    </div>
                  ) : null}
                  {item.scans !== undefined ? (
                    <div>
                      <dt>Scans</dt>
                      <dd>{String(item.scans)}</dd>
                    </div>
                  ) : null}
                  {item.createdAt ? (
                    <div>
                      <dt>Created</dt>
                      <dd>
                        {new Date(String(item.createdAt)).toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                </div>
                {item._id && section === "products" ? (
                  <Link
                    className="button button-secondary"
                    href={`/admin/products/${String(item._id)}`}
                  >
                    Open product workspace
                  </Link>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApprovalQueue() {
  const { data, error, loading, reload } = useApi<{ items: ReviewProduct[] }>(
    "/api/admin/review-queue",
  );
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Approval queue"
        description="Review every submitted product before approving the complete demo."
      />
      {loading ? (
        <Card className="skeleton-card large" />
      ) : error || !data ? (
        <AdminError message={error} retry={reload} />
      ) : data.items.length === 0 ? (
        <Card className="empty-state">
          <CheckCircle2 size={38} />
          <strong>No products require review</strong>
        </Card>
      ) : (
        <div className="review-grid">
          {data.items.map((product) => (
            <Card className="review-card" key={product._id}>
              <div className="record-title">
                <div>
                  <Link href={`/admin/products/${product._id}`}>
                    <strong>{product.name}</strong>
                  </Link>
                  <small>{product.category}</small>
                </div>
                <Badge tone="warning">{human(product.approvalStatus)}</Badge>
              </div>
              <p>
                Open the private quality workspace to compare originals,
                generated assets, model warnings, AR and QR before deciding.
              </p>
              <div className="review-actions">
                <Link
                  className="button button-secondary"
                  href={`/admin/products/${product._id}`}
                >
                  Open full review
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerHealthPage() {
  const state = useApi<WorkerHealth>("/api/admin/worker-health");
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Worker health"
        description="Heartbeat, current job, queue, device and version."
        action={
          <Button variant="secondary" onClick={state.reload}>
            <RefreshCw size={17} /> Refresh
          </Button>
        }
      />
      {state.error || !state.data ? (
        state.loading ? (
          <Card className="skeleton-card large" />
        ) : (
          <AdminError message={state.error} retry={state.reload} />
        )
      ) : (
        <Card className="worker-card">
          <div
            className={`worker-orb ${state.data.online ? "online" : "offline"}`}
          >
            <HeartPulse size={28} />
          </div>
          <div>
            <span className="eyebrow">3D worker</span>
            <h2>
              {state.data.online
                ? "Online and reporting"
                : "Offline—jobs remain safely queued"}
            </h2>
            <p>
              Last heartbeat:{" "}
              {state.data.lastHeartbeat
                ? new Date(state.data.lastHeartbeat).toLocaleString()
                : "Never"}
            </p>
          </div>
          <dl className="health-list">
            <div>
              <dt>Current job</dt>
              <dd>{state.data.currentJobId ?? "Idle"}</dd>
            </div>
            <div>
              <dt>Queue length</dt>
              <dd>{state.data.queueLength}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>{state.data.deviceType?.toUpperCase() ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{state.data.workerVersion ?? "Unknown"}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
