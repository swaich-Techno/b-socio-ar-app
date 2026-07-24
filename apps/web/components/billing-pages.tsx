"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Gauge,
  Gift,
  Landmark,
  LoaderCircle,
  PackagePlus,
  Percent,
  RefreshCw,
  ShieldCheck,
  TicketPercent,
  TrendingDown,
  TrendingUp,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, Progress } from "@bsocio/ui";
import { apiPatch, apiPost, useApi } from "@/hooks/use-api";

type PlanRecord = {
  _id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  enterprise: boolean;
  trialDays: number;
  sortOrder: number;
  limits: { monthlyRequests: number; companyAdmins: number; dispatchUsers: number; branches: number; retentionDays: number };
  featureFlags: Record<string, boolean>;
  overage: { enabled: boolean; behavior: "HARD_LIMIT" | "SOFT_LIMIT"; requiresApproval: boolean; rates: Record<string, number> };
  price?: { _id: string; currency: string; monthlyAmount: number; annualAmount: number; taxInclusive: boolean };
};
type BillingSummary = {
  company: { id: string; name: string; country: string; billingRegion: string };
  subscription: {
    _id: string; planId: string; status: string; billingPeriod: string; currency: string;
    currentPeriodStart: string; currentPeriodEnd: string; renewalDate?: string; trialEnd?: string;
    gracePeriodEnd?: string; basePrice: number; discount: number; tax: number; finalPayableAmount: number;
    cancelAtPeriodEnd: boolean; pendingPlanId?: string; pendingPlanEffectiveAt?: string;
    overageApproved: boolean; provider: string;
  };
  plan: PlanRecord;
  limits: { monthlyRequests: number; companyAdmins: number; dispatchUsers: number; branches: number; retentionDays: number };
  usage: {
    includedRequests: number; requestsUsed: number; remaining: number; overageRequests: number;
    addOnRequests: number; addOnRequestsUsed: number; billingCycleStart: string; billingCycleEnd: string;
    percentage: number; warningThreshold: 0 | 70 | 90 | 100;
  };
  plans: PlanRecord[];
  invoices: Array<{
    _id: string; invoiceNumber: string; planName: string; total: number; currency: string;
    paymentStatus: string; createdAt: string; isTest: boolean;
  }>;
  payments: Array<{
    _id: string; transactionReference: string; purpose: string; provider: string; amount: number;
    currency: string; status: string; isTest: boolean; createdAt: string;
  }>;
  addOnPacks: Array<{ _id: string; name: string; requests: number; price: number; currency: string; expiryDays: number }>;
  purchasedAddOns: Array<{ _id: string; requestsPurchased: number; requestsUsed: number; expiresAt: string; status: string; isTest: boolean }>;
  testMode: boolean;
  taxNotice: string;
};

const human = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currency === "INR" ? 0 : 2 }).format(amount);
const date = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const tone = (status: string): "neutral" | "success" | "warning" | "danger" | "info" => {
  if (["ACTIVE", "TRIALING", "MANUALLY_ACTIVATED", "PAID", "COMPLETED", "VERIFIED"].includes(status)) return "success";
  if (["PAYMENT_FAILED", "FAILED", "SUSPENDED", "EXPIRED", "CANCELLED", "REJECTED"].includes(status)) return "danger";
  if (["PAST_DUE", "GRACE_PERIOD", "PENDING", "TEST_PENDING"].includes(status)) return "warning";
  return "info";
};

function BillingError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <Card className="error-state">
      <AlertTriangle size={26} />
      <div><strong>Billing data is unavailable</strong><p>{message}</p></div>
      <Button variant="secondary" onClick={retry}><RefreshCw size={17} /> Retry</Button>
    </Card>
  );
}

function BillingPageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-copy"><span className="eyebrow">B Socio billing workspace</span><h1 className="page-title">{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

export function BillingDashboard() {
  const state = useApi<BillingSummary>("/api/billing/summary");
  const [period, setPeriod] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [coupon, setCoupon] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [validatedCoupon, setValidatedCoupon] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [testCheckout, setTestCheckout] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTiming, setCancelTiming] = useState<"IMMEDIATE" | "PERIOD_END">("PERIOD_END");

  async function validateCoupon(planId: string) {
    if (!coupon.trim()) return;
    setBusy("coupon"); setCouponMessage("");
    try {
      const result = await apiPost<{ code: string; description: string; benefit: { discount: number; requestCredits: number; trialDays: number } }>(
        "/api/billing/coupons/validate", { code: coupon, planId, billingPeriod: period },
      );
      setValidatedCoupon(result.code);
      const benefit = result.benefit.discount
        ? `${money(result.benefit.discount, state.data?.subscription.currency ?? "USD")} discount`
        : result.benefit.requestCredits
          ? `${result.benefit.requestCredits.toLocaleString()} request credits`
          : `${result.benefit.trialDays} extra trial days`;
      setCouponMessage(`${result.description} ${benefit}.`);
    } catch (reason) {
      setValidatedCoupon("");
      setCouponMessage(reason instanceof Error ? reason.message : "Coupon validation failed.");
    } finally { setBusy(""); }
  }

  async function startCheckout(planId: string) {
    setBusy(planId); setMessage("");
    try {
      const result = await apiPost<{ checkoutUrl: string; checkoutId: string; isTest: boolean; amount: number; currency: string }>(
        "/api/billing/checkout",
        { planId, billingPeriod: period, couponCode: validatedCoupon || undefined, idempotencyKey: crypto.randomUUID() },
      );
      if (result.isTest) {
        setTestCheckout(result.checkoutId);
        setMessage(`Test checkout prepared for ${money(result.amount, result.currency)}. Complete it below; no real charge will occur.`);
      } else {
        window.location.assign(result.checkoutUrl);
      }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Checkout could not be created."); }
    finally { setBusy(""); }
  }

  async function completeTest() {
    setBusy("test"); setMessage("");
    try {
      const result = await apiPost<{ message: string }>("/api/billing/test-payments/complete", { checkoutId: testCheckout });
      setMessage(result.message); setTestCheckout(""); await state.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Test payment could not be completed."); }
    finally { setBusy(""); }
  }

  async function scheduleDowngrade(planId: string) {
    if (!window.confirm("Schedule this downgrade for the next billing date?")) return;
    setBusy(planId); setMessage("");
    try {
      await apiPost("/api/billing/downgrade", { planId });
      setMessage("Downgrade scheduled for the next billing date."); await state.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Downgrade could not be scheduled."); }
    finally { setBusy(""); }
  }

  async function cancel() {
    if (!window.confirm(cancelTiming === "IMMEDIATE" ? "Cancel immediately and restrict new requests now?" : "Cancel renewal at the end of this billing period?")) return;
    setBusy("cancel"); setMessage("");
    try {
      await apiPost("/api/billing/cancel", { timing: cancelTiming, reason: cancelReason || undefined });
      setMessage("Cancellation preference saved."); await state.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Cancellation could not be completed."); }
    finally { setBusy(""); }
  }

  async function reactivate() {
    setBusy("reactivate"); setMessage("");
    try {
      await apiPost("/api/billing/reactivate", {});
      setMessage("Automatic renewal restored."); await state.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Reactivation failed."); }
    finally { setBusy(""); }
  }

  async function buyAddOn(packId: string) {
    setBusy(packId); setMessage("");
    try {
      const result = await apiPost<{ checkoutUrl: string; checkoutId: string; isTest: boolean }>(
        "/api/billing/add-ons/checkout", { packId, idempotencyKey: crypto.randomUUID() },
      );
      if (result.isTest) {
        setTestCheckout(result.checkoutId);
        setMessage("Test add-on checkout prepared. Complete it below; no real charge will occur.");
      } else window.location.assign(result.checkoutUrl);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Request pack checkout failed."); }
    finally { setBusy(""); }
  }

  if (state.loading) return <div className="dashboard-page"><BillingPageHeader title="Billing" description="Subscription, usage, invoices and payment controls." /><Card className="skeleton-card large" /></div>;
  if (state.error || !state.data) return <div className="dashboard-page"><BillingPageHeader title="Billing" description="Subscription, usage, invoices and payment controls." /><BillingError message={state.error} retry={state.reload} /></div>;
  const data = state.data;
  const statusWarning = ["PAYMENT_FAILED", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED"].includes(data.subscription.status);
  const trialEnding = data.subscription.status === "TRIALING" && data.subscription.trialEnd
    && new Date(data.subscription.trialEnd).getTime() - Date.now() <= 3 * 86_400_000;
  const nextPaidPlan = data.plans.find((plan) => !plan.enterprise && plan.code !== "FREE_TRIAL");

  return (
    <div className="dashboard-page">
      <BillingPageHeader
        title="Subscription & billing"
        description="Manage the plan, request allowance, renewal, add-ons and invoice history for this company."
        action={<Button variant="secondary" onClick={state.reload}><RefreshCw size={17} /> Refresh</Button>}
      />
      {data.testMode ? (
        <div className="billing-banner billing-banner-info" role="status">
          <ShieldCheck size={20} /><div><strong>Test-payment mode</strong><span>Transactions are clearly marked as test data and do not represent real settlement.</span></div>
        </div>
      ) : null}
      {statusWarning ? (
        <div className="billing-banner billing-banner-danger" role="alert">
          <AlertTriangle size={20} /><div><strong>{human(data.subscription.status)}</strong><span>{data.subscription.gracePeriodEnd ? `Resolve payment before ${date(data.subscription.gracePeriodEnd)}.` : "New requests may be restricted. Contact support if payment has already been made."}</span></div>
        </div>
      ) : null}
      {trialEnding ? (
        <div className="billing-banner billing-banner-warning" role="status">
          <CalendarClock size={20} /><div><strong>Your trial is ending soon</strong><span>Upgrade before {date(data.subscription.trialEnd)} to keep creating request links.</span></div>
          {nextPaidPlan ? <Button onClick={() => startCheckout(nextPaidPlan._id)}>Upgrade</Button> : null}
        </div>
      ) : null}
      {data.usage.warningThreshold ? (
        <div className={`billing-banner ${data.usage.warningThreshold === 100 ? "billing-banner-danger" : "billing-banner-warning"}`} role="status">
          <Gauge size={20} /><div><strong>{data.usage.warningThreshold}% usage threshold reached</strong><span>{data.usage.remaining.toLocaleString()} included or add-on requests remain this cycle.</span></div>
        </div>
      ) : null}
      {message ? <div className="form-success billing-message" role="status">{message}</div> : null}
      {testCheckout ? (
        <Card className="test-checkout-card">
          <div><span className="eyebrow">Simulation only</span><h2>Complete test transaction</h2><p>This will activate the selected item and create an invoice marked as test.</p></div>
          <Button onClick={completeTest} disabled={busy === "test"}>{busy === "test" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Complete test payment</Button>
        </Card>
      ) : null}

      <div className="billing-overview-grid">
        <Card className="billing-plan-hero">
          <div className="billing-plan-top">
            <div><span className="eyebrow">Current plan</span><h2>{data.plan.name}</h2><p>{data.plan.description}</p></div>
            <Badge tone={tone(data.subscription.status)}>{human(data.subscription.status)}</Badge>
          </div>
          <dl className="billing-facts">
            <div><dt>Billing</dt><dd>{human(data.subscription.billingPeriod)}</dd></div>
            <div><dt>Current period</dt><dd>{date(data.subscription.currentPeriodStart)} – {date(data.subscription.currentPeriodEnd)}</dd></div>
            <div><dt>{data.subscription.status === "TRIALING" ? "Trial ends" : "Renews"}</dt><dd>{date(data.subscription.trialEnd ?? data.subscription.renewalDate)}</dd></div>
            <div><dt>Current amount</dt><dd>{money(data.subscription.finalPayableAmount, data.subscription.currency)}</dd></div>
            <div><dt>Payment route</dt><dd>{human(data.subscription.provider)}</dd></div>
            <div><dt>Data retention</dt><dd>{data.limits.retentionDays} days</dd></div>
          </dl>
          {data.subscription.pendingPlanId ? <div className="pending-change"><Clock3 size={17} /> A plan change is scheduled for {date(data.subscription.pendingPlanEffectiveAt)}.</div> : null}
        </Card>
        <Card className="billing-usage-card">
          <div className="content-card-head"><div><span className="eyebrow">Request usage</span><h2>{data.usage.requestsUsed.toLocaleString()} of {(data.usage.includedRequests + data.usage.addOnRequests).toLocaleString()}</h2></div><Badge tone={data.usage.percentage >= 90 ? "warning" : "info"}>{data.usage.percentage}%</Badge></div>
          <Progress value={data.usage.percentage} label={`${data.usage.remaining.toLocaleString()} remaining`} />
          <dl className="billing-facts compact">
            <div><dt>Included</dt><dd>{data.usage.includedRequests.toLocaleString()}</dd></div>
            <div><dt>Add-on available</dt><dd>{Math.max(0, data.usage.addOnRequests - data.usage.addOnRequestsUsed).toLocaleString()}</dd></div>
            <div><dt>Overage</dt><dd>{data.usage.overageRequests.toLocaleString()}</dd></div>
            <div><dt>Resets</dt><dd>{date(data.usage.billingCycleEnd)}</dd></div>
          </dl>
        </Card>
      </div>

      <div className="metric-grid billing-limit-grid">
        <Card className="metric-card"><span><Gauge size={15} /> Monthly requests</span><strong>{data.limits.monthlyRequests.toLocaleString()}</strong><small>Server-enforced allowance</small></Card>
        <Card className="metric-card"><span><UsersRound size={15} /> Company admins</span><strong>{data.limits.companyAdmins}</strong><small>Maximum active admins</small></Card>
        <Card className="metric-card"><span><UsersRound size={15} /> Dispatch users</span><strong>{data.limits.dispatchUsers}</strong><small>Maximum dispatch seats</small></Card>
        <Card className="metric-card"><span><Building2 size={15} /> Branches</span><strong>{data.limits.branches}</strong><small>Maximum active branches</small></Card>
      </div>

      <section className="billing-section" aria-labelledby="plans-heading">
        <div className="billing-section-head">
          <div><span className="eyebrow">Plans</span><h2 id="plans-heading">Choose the capacity that fits</h2><p>Upgrades activate after successful payment. Downgrades are scheduled for renewal.</p></div>
          <div className="period-switch" role="group" aria-label="Billing period">
            <button className={period === "MONTHLY" ? "active" : ""} onClick={() => setPeriod("MONTHLY")}>Monthly</button>
            <button className={period === "ANNUAL" ? "active" : ""} onClick={() => setPeriod("ANNUAL")}>Annual <span>Save</span></button>
          </div>
        </div>
        <div className="coupon-row">
          <label className="field"><span className="field-label">Coupon or promotional code</span><input className="input" value={coupon} onChange={(event) => { setCoupon(event.target.value.toUpperCase()); setValidatedCoupon(""); }} placeholder="WELCOME20" maxLength={64} /></label>
          <Button variant="secondary" onClick={() => validateCoupon(data.plan._id)} disabled={!coupon.trim() || busy === "coupon"}>{busy === "coupon" ? <LoaderCircle className="spin" size={17} /> : <TicketPercent size={17} />} Validate</Button>
          {couponMessage ? <span className={validatedCoupon ? "coupon-valid" : "field-error"}>{couponMessage}</span> : null}
        </div>
        <div className="plan-grid">
          {data.plans.map((plan) => {
            const current = plan._id === data.plan._id;
            const lower = plan.sortOrder < data.plan.sortOrder;
            const unavailableTrial = plan.code === "FREE_TRIAL" && !current;
            const amount = period === "ANNUAL" ? plan.price?.annualAmount : plan.price?.monthlyAmount;
            return (
              <Card className={`plan-card ${current ? "is-current" : ""}`} key={plan._id}>
                <div className="plan-card-head"><div><h3>{plan.name}</h3><p>{plan.description}</p></div>{current ? <Badge tone="success">Current</Badge> : null}</div>
                <div className="plan-price">{plan.enterprise ? <><strong>Custom</strong><span>contract pricing</span></> : amount !== undefined && plan.price ? <><strong>{money(amount, plan.price.currency)}</strong><span>/{period === "ANNUAL" ? "year" : "month"}{plan.price.taxInclusive ? " · tax included" : " · tax extra"}</span></> : <><strong>Free</strong><span>{plan.trialDays} days</span></>}</div>
                <ul className="plan-feature-list">
                  <li><Check size={16} /> {plan.limits.monthlyRequests.toLocaleString()} requests/month</li>
                  <li><Check size={16} /> {plan.limits.dispatchUsers} dispatch users</li>
                  <li><Check size={16} /> {plan.limits.branches} branches</li>
                  {Object.entries(plan.featureFlags).filter(([, enabled]) => enabled).slice(0, 5).map(([feature]) => <li key={feature}><Check size={16} /> {human(feature)}</li>)}
                </ul>
                {plan.enterprise ? <Link className="button button-secondary" href="/dashboard/support">Contact B Socio</Link>
                  : current ? <Button variant="secondary" disabled>Current plan</Button>
                    : unavailableTrial ? <Button variant="secondary" disabled>Trial unavailable</Button>
                      : lower ? <Button variant="secondary" onClick={() => scheduleDowngrade(plan._id)} disabled={Boolean(busy)}><ArrowDownRight size={17} /> Downgrade at renewal</Button>
                        : <Button onClick={() => startCheckout(plan._id)} disabled={Boolean(busy)}>{busy === plan._id ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />} Upgrade</Button>}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="billing-section" aria-labelledby="addons-heading">
        <div className="billing-section-head"><div><span className="eyebrow">Add-on packs</span><h2 id="addons-heading">Add requests without changing plan</h2><p>Packs are consumed after the regular allowance and expire on the shown schedule.</p></div></div>
        <div className="addon-grid">
          {data.addOnPacks.length ? data.addOnPacks.map((pack) => (
            <Card className="addon-card" key={pack._id}>
              <PackagePlus size={22} /><div><strong>{pack.requests.toLocaleString()}</strong><span>additional requests</span></div>
              <p>{money(pack.price, pack.currency)} · expires {pack.expiryDays} days after purchase</p>
              <Button variant="secondary" onClick={() => buyAddOn(pack._id)} disabled={Boolean(busy)}>{busy === pack._id ? <LoaderCircle className="spin" size={17} /> : <Gift size={17} />} Buy pack</Button>
            </Card>
          )) : <Card className="empty-state compact"><PackagePlus size={30} /><strong>No request packs in {data.subscription.currency}</strong><span>Contact support for a custom pack.</span></Card>}
        </div>
      </section>

      <div className="content-grid two billing-history-grid">
        <Card className="content-card">
          <div className="content-card-head"><div><h2>Invoice history</h2><p className="muted">{data.taxNotice}</p></div><FileText size={22} /></div>
          {data.invoices.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Invoice</th><th>Plan</th><th>Total</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={invoice._id}><td><strong>{invoice.invoiceNumber}</strong><small>{date(invoice.createdAt)}{invoice.isTest ? " · Test" : ""}</small></td><td>{invoice.planName}</td><td>{money(invoice.total, invoice.currency)}</td><td><Badge tone={tone(invoice.paymentStatus)}>{human(invoice.paymentStatus)}</Badge></td><td><Link className="table-link" href={`/dashboard/invoices/${invoice._id}`}>View</Link></td></tr>)}</tbody></table></div>
            : <div className="empty-state compact"><FileText size={30} /><strong>No invoices yet</strong></div>}
        </Card>
        <Card className="content-card">
          <div className="content-card-head"><div><h2>Payment history</h2><p className="muted">Provider and test state are recorded explicitly.</p></div><CreditCard size={22} /></div>
          {data.payments.length ? <div className="payment-list">{data.payments.map((payment) => <div key={payment._id}><span><strong>{human(payment.purpose)}</strong><small>{human(payment.provider)} · {date(payment.createdAt)}{payment.isTest ? " · Test" : ""}</small></span><span><strong>{money(payment.amount, payment.currency)}</strong><Badge tone={tone(payment.status)}>{human(payment.status)}</Badge></span></div>)}</div>
            : <div className="empty-state compact"><CreditCard size={30} /><strong>No subscription payments yet</strong></div>}
        </Card>
      </div>

      <Card className="cancellation-card">
        <div><span className="eyebrow">Renewal controls</span><h2>Cancel or reactivate</h2><p>End-of-period cancellation is recommended. Existing data remains subject to the plan retention policy.</p></div>
        {data.subscription.cancelAtPeriodEnd ? <Button onClick={reactivate} disabled={busy === "reactivate"}><RefreshCw size={17} /> Reactivate renewal</Button> : (
          <div className="cancellation-form">
            <label className="field"><span className="field-label">Cancellation timing</span><select className="input" value={cancelTiming} onChange={(event) => setCancelTiming(event.target.value as "IMMEDIATE" | "PERIOD_END")}><option value="PERIOD_END">End of billing period</option><option value="IMMEDIATE">Immediately</option></select></label>
            <label className="field"><span className="field-label">Reason (optional)</span><input className="input" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={1000} /></label>
            <Button variant="danger" onClick={cancel} disabled={busy === "cancel"}><XCircle size={17} /> Cancel subscription</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

type AdminMetrics = {
  metrics: Record<string, number>;
  revenueByPlan: Array<{ label: string; amount: number }>;
  revenueByCountry: Array<{ label: string; amount: number }>;
  revenueByCurrency: Array<{ label: string; amount: number }>;
  subscriptions: Array<{ _id: string; businessId: string; companyName: string; planName: string; country: string; status: string; currency: string; finalPayableAmount: number; billingPeriod: string; renewalDate?: string }>;
  plans: PlanRecord[];
};
type AdminCatalog = {
  plans: PlanRecord[];
  prices: Array<{ _id: string; planId: string; region: string; currency: string; monthlyAmount: number; annualAmount: number; taxInclusive: boolean }>;
  coupons: Array<{ _id: string; code: string; type: string; discountValue: number; redemptionCount: number; maximumRedemptions?: number; active: boolean; expiryDate: string }>;
  addOnPacks: Array<{
    _id: string; name: string; requests: number; price: number; currency: string;
    expiryDays: number; eligiblePlanIds: string[]; active: boolean;
  }>;
  businesses: Array<{ _id: string; name: string; country: string; billingRegion?: string }>;
};

const metricMeta: Record<string, { label: string; icon: typeof Gauge; format?: "currency" | "percent" }> = {
  monthlyRecurringRevenue: { label: "MRR", icon: TrendingUp, format: "currency" },
  annualRecurringRevenue: { label: "ARR", icon: CircleDollarSign, format: "currency" },
  activeSubscriptions: { label: "Active subscriptions", icon: Check },
  trialCompanies: { label: "Trial companies", icon: Clock3 },
  trialToPaidConversion: { label: "Trial to paid", icon: Percent, format: "percent" },
  cancelledSubscriptions: { label: "Cancelled", icon: TrendingDown },
  failedPayments: { label: "Failed payments", icon: XCircle },
  requestsConsumed: { label: "Requests consumed", icon: Gauge },
  overageRevenue: { label: "Overage revenue", icon: TrendingUp, format: "currency" },
  addOnRevenue: { label: "Add-on revenue", icon: PackagePlus, format: "currency" },
  upcomingRenewals: { label: "Upcoming renewals", icon: CalendarClock },
  expiringTrials: { label: "Expiring trials", icon: AlertTriangle },
  pastDueAccounts: { label: "Past-due accounts", icon: CreditCard },
  churnRate: { label: "Churn rate", icon: TrendingDown, format: "percent" },
};

export function AdminBillingDashboard() {
  const [filters, setFilters] = useState({ planId: "", country: "", currency: "USD", status: "", from: "", to: "" });
  const query = useMemo(() => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return `/api/admin/billing/metrics?${params}`;
  }, [filters]);
  const metrics = useApi<AdminMetrics>(query);
  const catalog = useApi<AdminCatalog>("/api/admin/billing/catalog");
  const session = useApi<{ user: { role: string } }>("/api/auth/session");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState({
    businessId: "", planId: "", currency: "USD", customPrice: "0",
    startDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    requestLimit: "150", companyAdminLimit: "1", dispatchUserLimit: "2", branchLimit: "1",
    enabledFeatures: "", paymentStatus: "PAID", internalNotes: "",
  });
  const [offline, setOffline] = useState({
    businessId: "", method: "BANK_TRANSFER", paymentReference: "",
    paymentDate: new Date().toISOString().slice(0, 10), amount: "0", currency: "USD",
    status: "APPROVED", proofReference: "", internalNotes: "",
  });
  const [usageAdjustment, setUsageAdjustment] = useState({ businessId: "", adjustment: "", reason: "" });
  const [addOn, setAddOn] = useState({
    name: "", requests: "100", price: "25", currency: "USD", expiryDays: "365", active: true,
  });
  const [coupon, setCoupon] = useState({
    code: "", description: "", type: "PERCENTAGE", discountValue: "20",
    startDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  });
  const isSuperAdmin = session.data?.user.role === "SUPER_ADMIN";

  async function seed() {
    setBusy("seed"); setMessage("");
    try { await apiPost("/api/admin/billing/seed", { includeSamples: false }); setMessage("Default billing catalog seeded without changing existing values."); await Promise.all([metrics.reload(), catalog.reload()]); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Seed failed."); }
    finally { setBusy(""); }
  }
  async function activateManual() {
    setBusy("manual"); setMessage("");
    try {
      await apiPost("/api/admin/billing/manual-subscriptions", {
        ...manual, customPrice: Number(manual.customPrice), requestLimit: Number(manual.requestLimit),
        companyAdminLimit: Number(manual.companyAdminLimit), dispatchUserLimit: Number(manual.dispatchUserLimit),
        branchLimit: Number(manual.branchLimit),
        enabledFeatures: manual.enabledFeatures.split(",").map((value) => value.trim()).filter(Boolean),
        startDate: new Date(`${manual.startDate}T00:00:00Z`).toISOString(),
        expiryDate: new Date(`${manual.expiryDate}T00:00:00Z`).toISOString(),
      });
      setMessage("Manual subscription activated and audited."); await metrics.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Manual activation failed."); }
    finally { setBusy(""); }
  }
  async function recordOfflinePayment() {
    setBusy("offline"); setMessage("");
    try {
      await apiPost("/api/admin/billing/manual-payments", {
        ...offline, amount: Number(offline.amount),
        paymentDate: new Date(`${offline.paymentDate}T12:00:00Z`).toISOString(),
        proofReference: offline.proofReference || undefined,
        internalNotes: offline.internalNotes || undefined,
      });
      setMessage("Offline payment record saved and audited.");
      setOffline((value) => ({ ...value, paymentReference: "", proofReference: "", internalNotes: "" }));
      await metrics.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Offline payment could not be recorded."); }
    finally { setBusy(""); }
  }
  async function changeUsage() {
    setBusy("usage"); setMessage("");
    try {
      await apiPost("/api/admin/billing/usage-adjustments", {
        businessId: usageAdjustment.businessId,
        adjustment: Number(usageAdjustment.adjustment),
        reason: usageAdjustment.reason,
      });
      setMessage("Usage entitlement adjusted and audited.");
      setUsageAdjustment((value) => ({ ...value, adjustment: "", reason: "" }));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Usage adjustment failed."); }
    finally { setBusy(""); }
  }
  async function createCoupon() {
    setBusy("coupon"); setMessage("");
    try {
      await apiPost("/api/admin/billing/coupons", {
        ...coupon, discountValue: Number(coupon.discountValue), eligiblePlanIds: [], eligibleBillingPeriods: ["MONTHLY", "ANNUAL"],
        maximumRedemptions: 500, perCompanyUsageLimit: 1, newCustomersOnly: false, active: true,
        startDate: new Date(`${coupon.startDate}T00:00:00Z`).toISOString(),
        expiryDate: new Date(`${coupon.expiryDate}T23:59:59Z`).toISOString(),
      });
      setMessage("Coupon created and audited."); setCoupon((value) => ({ ...value, code: "", description: "" })); await catalog.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Coupon creation failed."); }
    finally { setBusy(""); }
  }
  async function createAddOn() {
    setBusy("add-on"); setMessage("");
    try {
      await apiPost("/api/admin/billing/add-ons", {
        ...addOn,
        requests: Number(addOn.requests),
        price: Number(addOn.price),
        expiryDays: Number(addOn.expiryDays),
        eligiblePlanIds: [],
      });
      setMessage("Add-on request pack created and audited.");
      setAddOn((value) => ({ ...value, name: "" }));
      await catalog.reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Add-on pack creation failed."); }
    finally { setBusy(""); }
  }

  if (metrics.loading || catalog.loading) return <div className="dashboard-page"><BillingPageHeader title="Subscription operations" description="Revenue, plans, usage, renewals and account risk." /><Card className="skeleton-card large" /></div>;
  if (metrics.error || catalog.error || !metrics.data || !catalog.data) return <div className="dashboard-page"><BillingPageHeader title="Subscription operations" description="Revenue, plans, usage, renewals and account risk." /><BillingError message={metrics.error || catalog.error} retry={() => { void metrics.reload(); void catalog.reload(); }} /></div>;
  const data = metrics.data;
  const catalogPrices = catalog.data.prices;
  const currencyForHeadline = filters.currency || "USD";
  return (
    <div className="dashboard-page">
      <BillingPageHeader title="Subscription operations" description="Revenue, plan configuration, company subscriptions, payment risk and usage from live billing records." action={isSuperAdmin ? <Button variant="secondary" onClick={seed} disabled={busy === "seed"}><RefreshCw size={17} /> Seed defaults</Button> : undefined} />
      {message ? <div className="form-success billing-message" role="status">{message}</div> : null}
      <Card className="billing-filter-card">
        <label className="field"><span className="field-label">Plan</span><select className="input" value={filters.planId} onChange={(event) => setFilters((value) => ({ ...value, planId: event.target.value }))}><option value="">All plans</option>{catalog.data.plans.map((plan) => <option value={plan._id} key={plan._id}>{plan.name}</option>)}</select></label>
        <label className="field"><span className="field-label">Country</span><select className="input" value={filters.country} onChange={(event) => setFilters((value) => ({ ...value, country: event.target.value }))}><option value="">All countries</option>{[...new Set(catalog.data.businesses.map((business) => business.country))].sort().map((country) => <option key={country}>{country}</option>)}</select></label>
        <label className="field"><span className="field-label">Currency</span><select className="input" value={filters.currency} onChange={(event) => setFilters((value) => ({ ...value, currency: event.target.value }))}><option value="">All currencies</option>{["INR", "USD", "CAD", "GBP", "EUR", "AED"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label className="field"><span className="field-label">Status</span><select className="input" value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">All statuses</option>{["TRIALING", "ACTIVE", "PAST_DUE", "PAYMENT_FAILED", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "EXPIRED", "MANUALLY_ACTIVATED"].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="field"><span className="field-label">From</span><input className="input" type="date" value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} /></label>
        <label className="field"><span className="field-label">To</span><input className="input" type="date" value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} /></label>
      </Card>

      <div className="metric-grid admin-billing-metrics">
        {Object.entries(metricMeta).map(([key, meta]) => {
          const Icon = meta.icon;
          const numeric = data.metrics[key] ?? 0;
          const display = meta.format === "currency" ? money(numeric, currencyForHeadline) : meta.format === "percent" ? `${(numeric * 100).toFixed(1)}%` : numeric.toLocaleString();
          return <Card className="metric-card" key={key}><span><Icon size={15} /> {meta.label}</span><strong>{display}</strong><small>Current filtered view</small></Card>;
        })}
      </div>

      <div className="content-grid three">
        <RevenueBreakdown title="Revenue by plan" rows={data.revenueByPlan} />
        <RevenueBreakdown title="Revenue by country" rows={data.revenueByCountry} />
        <RevenueBreakdown title="Revenue by currency" rows={data.revenueByCurrency} />
      </div>

      <section className="billing-section" aria-labelledby="admin-plans-heading">
        <div className="billing-section-head"><div><span className="eyebrow">Catalog</span><h2 id="admin-plans-heading">Editable plans and limits</h2><p>All entitlement changes are applied by the server and recorded in the audit log.</p></div></div>
        <div className="admin-plan-grid">{catalog.data.plans.map((plan) => <AdminPlanEditor key={plan._id} plan={plan} prices={catalogPrices.filter((price) => price.planId === plan._id)} editable={isSuperAdmin} onSaved={async (text) => { setMessage(text); await Promise.all([catalog.reload(), metrics.reload()]); }} />)}</div>
      </section>

      <Card className="content-card">
        <div className="content-card-head"><div><h2>Company subscriptions</h2><p className="muted">Renewal, country and payment-risk context remain tenant scoped.</p></div><BadgeDollarSign size={22} /></div>
        <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Company</th><th>Plan</th><th>Status</th><th>Billing</th><th>Amount</th><th>Renewal</th></tr></thead><tbody>{data.subscriptions.map((subscription) => <tr key={subscription._id}><td><strong>{subscription.companyName}</strong><small>{subscription.country}</small></td><td>{subscription.planName}</td><td><Badge tone={tone(subscription.status)}>{human(subscription.status)}</Badge></td><td>{human(subscription.billingPeriod)}</td><td>{money(subscription.finalPayableAmount, subscription.currency)}</td><td>{date(subscription.renewalDate)}</td></tr>)}</tbody></table></div>
      </Card>

      {isSuperAdmin ? (
        <div className="content-grid two">
          <Card className="content-card admin-action-card">
            <div className="content-card-head"><div><h2>Manual subscription</h2><p className="muted">For pilots, partners, offline customers and approved enterprise contracts.</p></div><Landmark size={22} /></div>
            <label className="field"><span className="field-label">Company</span><select className="input" value={manual.businessId} onChange={(event) => setManual((value) => ({ ...value, businessId: event.target.value }))}><option value="">Choose company</option>{catalog.data.businesses.map((business) => <option value={business._id} key={business._id}>{business.name} · {business.country}</option>)}</select></label>
            <div className="form-grid">
              <label className="field"><span className="field-label">Plan</span><select className="input" value={manual.planId} onChange={(event) => setManual((value) => ({ ...value, planId: event.target.value }))}><option value="">Choose plan</option>{catalog.data.plans.map((plan) => <option value={plan._id} key={plan._id}>{plan.name}</option>)}</select></label>
              <label className="field"><span className="field-label">Currency</span><select className="input" value={manual.currency} onChange={(event) => setManual((value) => ({ ...value, currency: event.target.value }))}>{["INR", "USD", "CAD", "GBP", "EUR", "AED"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="field"><span className="field-label">Custom price</span><input className="input" type="number" min="0" value={manual.customPrice} onChange={(event) => setManual((value) => ({ ...value, customPrice: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Request limit</span><input className="input" type="number" min="0" value={manual.requestLimit} onChange={(event) => setManual((value) => ({ ...value, requestLimit: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Company admins</span><input className="input" type="number" min="1" value={manual.companyAdminLimit} onChange={(event) => setManual((value) => ({ ...value, companyAdminLimit: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Dispatch users</span><input className="input" type="number" min="0" value={manual.dispatchUserLimit} onChange={(event) => setManual((value) => ({ ...value, dispatchUserLimit: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Branches</span><input className="input" type="number" min="1" value={manual.branchLimit} onChange={(event) => setManual((value) => ({ ...value, branchLimit: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Start</span><input className="input" type="date" value={manual.startDate} onChange={(event) => setManual((value) => ({ ...value, startDate: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Expiry</span><input className="input" type="date" value={manual.expiryDate} onChange={(event) => setManual((value) => ({ ...value, expiryDate: event.target.value }))} /></label>
            </div>
            <label className="field"><span className="field-label">Enabled feature keys</span><input className="input" value={manual.enabledFeatures} onChange={(event) => setManual((value) => ({ ...value, enabledFeatures: event.target.value }))} placeholder="api_access, webhooks, white_label" /><span className="field-hint">Comma-separated overrides; plan feature flags remain the baseline.</span></label>
            <label className="field"><span className="field-label">Internal notes</span><textarea className="input" value={manual.internalNotes} onChange={(event) => setManual((value) => ({ ...value, internalNotes: event.target.value }))} maxLength={5000} /></label>
            <Button onClick={activateManual} disabled={busy === "manual" || !manual.businessId || !manual.planId}><ShieldCheck size={17} /> Activate and audit</Button>
          </Card>
          <Card className="content-card admin-action-card">
            <div className="content-card-head"><div><h2>Create coupon</h2><p className="muted">Codes are validated server-side against date, company, plan, period and redemption rules.</p></div><TicketPercent size={22} /></div>
            <div className="form-grid"><label className="field"><span className="field-label">Code</span><input className="input" value={coupon.code} onChange={(event) => setCoupon((value) => ({ ...value, code: event.target.value.toUpperCase() }))} maxLength={64} /></label><label className="field"><span className="field-label">Type</span><select className="input" value={coupon.type} onChange={(event) => setCoupon((value) => ({ ...value, type: event.target.value }))}>{["PERCENTAGE", "FIXED_AMOUNT", "TRIAL_EXTENSION", "REQUEST_CREDITS", "ONE_TIME", "RECURRING"].map((type) => <option key={type}>{type}</option>)}</select></label><label className="field"><span className="field-label">Value</span><input className="input" type="number" min="0" value={coupon.discountValue} onChange={(event) => setCoupon((value) => ({ ...value, discountValue: event.target.value }))} /></label><label className="field"><span className="field-label">Start</span><input className="input" type="date" value={coupon.startDate} onChange={(event) => setCoupon((value) => ({ ...value, startDate: event.target.value }))} /></label><label className="field"><span className="field-label">Expiry</span><input className="input" type="date" value={coupon.expiryDate} onChange={(event) => setCoupon((value) => ({ ...value, expiryDate: event.target.value }))} /></label></div>
            <label className="field"><span className="field-label">Description</span><textarea className="input" value={coupon.description} onChange={(event) => setCoupon((value) => ({ ...value, description: event.target.value }))} maxLength={1000} /></label>
            <Button onClick={createCoupon} disabled={busy === "coupon" || !coupon.code || coupon.description.length < 3}><TicketPercent size={17} /> Create coupon</Button>
            <div className="coupon-admin-list">{catalog.data.coupons.slice(0, 8).map((item) => <div key={item._id}><span><strong>{item.code}</strong><small>{human(item.type)} · expires {date(item.expiryDate)}</small></span><Badge tone={item.active ? "success" : "neutral"}>{item.redemptionCount}/{item.maximumRedemptions ?? "∞"}</Badge></div>)}</div>
          </Card>
        </div>
      ) : null}
      {isSuperAdmin ? (
        <div className="content-grid two">
          <Card className="content-card admin-action-card">
            <div className="content-card-head"><div><h2>Record offline payment</h2><p className="muted">Bank transfer, UPI, cash, cheque and manual-invoice records. Internal notes stay hidden from company users.</p></div><Landmark size={22} /></div>
            <label className="field"><span className="field-label">Company</span><select className="input" value={offline.businessId} onChange={(event) => setOffline((value) => ({ ...value, businessId: event.target.value }))}><option value="">Choose company</option>{catalog.data.businesses.map((business) => <option value={business._id} key={business._id}>{business.name}</option>)}</select></label>
            <div className="form-grid">
              <label className="field"><span className="field-label">Method</span><select className="input" value={offline.method} onChange={(event) => setOffline((value) => ({ ...value, method: event.target.value }))}>{["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "MANUAL_INVOICE", "OTHER"].map((method) => <option key={method}>{method}</option>)}</select></label>
              <label className="field"><span className="field-label">Reference</span><input className="input" value={offline.paymentReference} onChange={(event) => setOffline((value) => ({ ...value, paymentReference: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Amount</span><input className="input" type="number" min="0" value={offline.amount} onChange={(event) => setOffline((value) => ({ ...value, amount: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Currency</span><select className="input" value={offline.currency} onChange={(event) => setOffline((value) => ({ ...value, currency: event.target.value }))}>{["INR", "USD", "CAD", "GBP", "EUR", "AED"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="field"><span className="field-label">Payment date</span><input className="input" type="date" value={offline.paymentDate} onChange={(event) => setOffline((value) => ({ ...value, paymentDate: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Decision</span><select className="input" value={offline.status} onChange={(event) => setOffline((value) => ({ ...value, status: event.target.value }))}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label>
            </div>
            <label className="field"><span className="field-label">Proof reference</span><input className="input" value={offline.proofReference} onChange={(event) => setOffline((value) => ({ ...value, proofReference: event.target.value }))} /></label>
            <label className="field"><span className="field-label">Internal notes</span><textarea className="input" value={offline.internalNotes} onChange={(event) => setOffline((value) => ({ ...value, internalNotes: event.target.value }))} /></label>
            <Button onClick={recordOfflinePayment} disabled={busy === "offline" || !offline.businessId || offline.paymentReference.length < 2}><Landmark size={17} /> Record payment</Button>
          </Card>
          <Card className="content-card admin-action-card">
            <div className="content-card-head"><div><h2>Exceptional usage adjustment</h2><p className="muted">Positive values add entitlement; negative values remove it. Every adjustment requires an audited reason.</p></div><Gauge size={22} /></div>
            <label className="field"><span className="field-label">Company</span><select className="input" value={usageAdjustment.businessId} onChange={(event) => setUsageAdjustment((value) => ({ ...value, businessId: event.target.value }))}><option value="">Choose company</option>{catalog.data.businesses.map((business) => <option value={business._id} key={business._id}>{business.name}</option>)}</select></label>
            <label className="field"><span className="field-label">Request adjustment</span><input className="input" type="number" value={usageAdjustment.adjustment} onChange={(event) => setUsageAdjustment((value) => ({ ...value, adjustment: event.target.value }))} placeholder="+100 or -25" /></label>
            <label className="field"><span className="field-label">Reason</span><textarea className="input" value={usageAdjustment.reason} onChange={(event) => setUsageAdjustment((value) => ({ ...value, reason: event.target.value }))} maxLength={1000} /></label>
            <Button variant="secondary" onClick={changeUsage} disabled={busy === "usage" || !usageAdjustment.businessId || !usageAdjustment.adjustment || usageAdjustment.reason.length < 3}><Gauge size={17} /> Apply adjustment</Button>
          </Card>
          <Card className="content-card admin-action-card admin-add-on-card">
            <div className="content-card-head"><div><h2>Add-on request packs</h2><p className="muted">Create and maintain one-time request capacity sold after the included quota is exhausted.</p></div><PackagePlus size={22} /></div>
            <div className="form-grid">
              <label className="field"><span className="field-label">Pack name</span><input className="input" value={addOn.name} onChange={(event) => setAddOn((value) => ({ ...value, name: event.target.value }))} placeholder="100 extra requests" /></label>
              <label className="field"><span className="field-label">Requests</span><input className="input" type="number" min="1" value={addOn.requests} onChange={(event) => setAddOn((value) => ({ ...value, requests: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Price</span><input className="input" type="number" min="0" value={addOn.price} onChange={(event) => setAddOn((value) => ({ ...value, price: event.target.value }))} /></label>
              <label className="field"><span className="field-label">Currency</span><select className="input" value={addOn.currency} onChange={(event) => setAddOn((value) => ({ ...value, currency: event.target.value }))}>{["INR", "USD", "CAD", "GBP", "EUR", "AED"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <label className="field"><span className="field-label">Expiry days</span><input className="input" type="number" min="1" max="3650" value={addOn.expiryDays} onChange={(event) => setAddOn((value) => ({ ...value, expiryDays: event.target.value }))} /></label>
            </div>
            <Button onClick={createAddOn} disabled={busy === "add-on" || addOn.name.length < 2}><PackagePlus size={17} /> Create pack</Button>
            <div className="add-on-admin-list">
              {catalog.data.addOnPacks.map((pack) => (
                <AdminAddOnEditor
                  key={pack._id}
                  pack={pack}
                  onSaved={async (text) => { setMessage(text); await catalog.reload(); }}
                />
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function RevenueBreakdown({ title, rows }: { title: string; rows: Array<{ label: string; amount: number }> }) {
  const maximum = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <Card className="content-card revenue-card">
      <div className="content-card-head"><div><h2>{title}</h2><p className="muted">Gross recorded payment amounts; currencies remain separate in detailed records.</p></div><CircleDollarSign size={22} /></div>
      {rows.length ? <div className="revenue-bars">{rows.slice(0, 8).map((row) => <div key={row.label}><div><span>{row.label}</span><strong>{row.amount.toLocaleString()}</strong></div><span className="revenue-track"><i style={{ width: `${Math.max(3, (row.amount / maximum) * 100)}%` }} /></span></div>)}</div> : <div className="empty-state compact"><CircleDollarSign size={30} /><strong>No revenue in this view</strong></div>}
    </Card>
  );
}

function AdminAddOnEditor({ pack, onSaved }: {
  pack: AdminCatalog["addOnPacks"][number];
  onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: pack.name,
    requests: String(pack.requests),
    price: String(pack.price),
    expiryDays: String(pack.expiryDays),
    active: pack.active,
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await apiPatch("/api/admin/billing/add-ons", {
        packId: pack._id,
        name: form.name,
        requests: Number(form.requests),
        price: Number(form.price),
        expiryDays: Number(form.expiryDays),
        active: form.active,
      });
      await onSaved(`${pack.name} add-on pack saved and audited.`);
    } catch (reason) { await onSaved(reason instanceof Error ? reason.message : "Add-on pack update failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="add-on-admin-row">
      <div><strong>{pack.currency}</strong><small>{pack.eligiblePlanIds.length ? `${pack.eligiblePlanIds.length} eligible plans` : "All paid plans"}</small></div>
      <input className="input" aria-label={`${pack.name} name`} value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />
      <input className="input" aria-label={`${pack.name} requests`} type="number" min="1" value={form.requests} onChange={(event) => setForm((value) => ({ ...value, requests: event.target.value }))} />
      <input className="input" aria-label={`${pack.name} price`} type="number" min="0" value={form.price} onChange={(event) => setForm((value) => ({ ...value, price: event.target.value }))} />
      <input className="input" aria-label={`${pack.name} expiry days`} type="number" min="1" max="3650" value={form.expiryDays} onChange={(event) => setForm((value) => ({ ...value, expiryDays: event.target.value }))} />
      <label className="check-row"><input type="checkbox" checked={form.active} onChange={(event) => setForm((value) => ({ ...value, active: event.target.checked }))} /> Active</label>
      <Button variant="secondary" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Save</Button>
    </div>
  );
}

function AdminPlanEditor({ plan, prices, editable, onSaved }: {
  plan: PlanRecord;
  prices: AdminCatalog["prices"];
  editable: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: plan.name,
    monthlyRequests: String(plan.limits.monthlyRequests),
    companyAdmins: String(plan.limits.companyAdmins),
    dispatchUsers: String(plan.limits.dispatchUsers),
    branches: String(plan.limits.branches),
    retentionDays: String(plan.limits.retentionDays),
    overageEnabled: plan.overage.enabled,
    overageBehavior: plan.overage.behavior,
  });
  const [priceForms, setPriceForms] = useState(prices.map((price) => ({
    priceId: price._id,
    region: price.region,
    currency: price.currency,
    monthlyAmount: String(price.monthlyAmount),
    annualAmount: String(price.annualAmount),
    taxInclusive: price.taxInclusive,
  })));
  const [featureFlags, setFeatureFlags] = useState(plan.featureFlags);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await apiPatch("/api/admin/billing/plans", {
        planId: plan._id,
        name: form.name,
        limits: {
          monthlyRequests: Number(form.monthlyRequests), companyAdmins: Number(form.companyAdmins),
          dispatchUsers: Number(form.dispatchUsers), branches: Number(form.branches), retentionDays: Number(form.retentionDays),
        },
        overage: { enabled: form.overageEnabled, behavior: form.overageBehavior },
        featureFlags,
        prices: priceForms.map((price) => ({
          priceId: price.priceId,
          monthlyAmount: Number(price.monthlyAmount),
          annualAmount: Number(price.annualAmount),
          taxInclusive: price.taxInclusive,
        })),
      });
      await onSaved(`${plan.name} plan limits saved and audited.`);
    } catch (reason) { await onSaved(reason instanceof Error ? reason.message : "Plan update failed."); }
    finally { setBusy(false); }
  }
  return (
    <Card className="admin-plan-card">
      <div className="record-title"><span><strong>{plan.name}</strong><small>{plan.code} · {plan.active ? "Active" : "Inactive"}</small></span>{plan.enterprise ? <Badge tone="info">Manual approval</Badge> : null}</div>
      <div className="admin-plan-fields">
        <label className="field"><span className="field-label">Plan name</span><input className="input" value={form.name} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Monthly requests</span><input className="input" type="number" min="0" value={form.monthlyRequests} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, monthlyRequests: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Company admins</span><input className="input" type="number" min="1" value={form.companyAdmins} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, companyAdmins: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Dispatch users</span><input className="input" type="number" min="0" value={form.dispatchUsers} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, dispatchUsers: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Branches</span><input className="input" type="number" min="1" value={form.branches} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, branches: event.target.value }))} /></label>
        <label className="field"><span className="field-label">Retention days</span><input className="input" type="number" min="1" value={form.retentionDays} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, retentionDays: event.target.value }))} /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={form.overageEnabled} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, overageEnabled: event.target.checked }))} /> Overage billing enabled</label>
      <label className="field"><span className="field-label">Limit behavior</span><select className="input" value={form.overageBehavior} disabled={!editable} onChange={(event) => setForm((value) => ({ ...value, overageBehavior: event.target.value as "HARD_LIMIT" | "SOFT_LIMIT" }))}><option value="HARD_LIMIT">Hard limit</option><option value="SOFT_LIMIT">Soft limit with company approval</option></select></label>
      <fieldset className="feature-flag-editor">
        <legend>Feature entitlements</legend>
        {Object.entries(featureFlags).map(([feature, enabled]) => (
          <label className="check-row" key={feature}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!editable}
              onChange={(event) => setFeatureFlags((values) => ({ ...values, [feature]: event.target.checked }))}
            />
            {human(feature)}
          </label>
        ))}
      </fieldset>
      <div className="admin-price-editor">
        {priceForms.map((price, index) => (
          <div key={price.priceId}>
            <strong>{price.region.replaceAll("_", " ")} · {price.currency}</strong>
            <label className="field"><span className="field-label">Monthly</span><input className="input" type="number" min="0" value={price.monthlyAmount} disabled={!editable} onChange={(event) => setPriceForms((values) => values.map((value, valueIndex) => valueIndex === index ? { ...value, monthlyAmount: event.target.value } : value))} /></label>
            <label className="field"><span className="field-label">Annual</span><input className="input" type="number" min="0" value={price.annualAmount} disabled={!editable} onChange={(event) => setPriceForms((values) => values.map((value, valueIndex) => valueIndex === index ? { ...value, annualAmount: event.target.value } : value))} /></label>
            <label className="check-row"><input type="checkbox" checked={price.taxInclusive} disabled={!editable} onChange={(event) => setPriceForms((values) => values.map((value, valueIndex) => valueIndex === index ? { ...value, taxInclusive: event.target.checked } : value))} /> Tax inclusive</label>
          </div>
        ))}
      </div>
      {editable ? <Button variant="secondary" onClick={save} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Save plan and prices</Button> : null}
    </Card>
  );
}
