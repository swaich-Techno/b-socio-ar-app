import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  billingPeriodEnd,
  calculateCouponDiscount,
  canConsumeRequest,
  countryToBillingRegion,
  downgradeCapacityBlockers,
  featureEntitled,
  getOverageRequestsFromUsage,
  getRemainingRequestsFromUsage,
  lifecycleStatus,
  proratedUpgradeAmount,
  subscriptionHasAccess,
  usageWarningThreshold,
  usageWindow,
} from "@/services/billing/domain";
import {
  validateRazorpayWebhookSignature,
  validateStripeWebhookSignature,
} from "@/services/billing/providers";
import {
  BillingEvent,
  CouponRedemption,
  Invoice,
  InvoiceItem,
  ManualPayment,
  PaymentWebhookEvent,
  PurchasedAddOn,
  Refund,
  Subscription,
  SubscriptionChange,
  SubscriptionUsage,
} from "@/models/billing";

const now = new Date("2026-07-23T12:00:00.000Z");
const activeLifecycle = {
  status: "ACTIVE" as const,
  currentPeriodEnd: new Date("2026-08-23T12:00:00.000Z"),
};

describe("subscription and billing model", () => {
  it("1. creates a fourteen-day no-card trial window", () => {
    expect(billingPeriodEnd(now, "TRIAL", 14).toISOString()).toBe("2026-08-06T12:00:00.000Z");
    expect(subscriptionHasAccess({ status: "TRIALING", currentPeriodEnd: addDays(now, 14), trialEnd: addDays(now, 14) }, now)).toBe(true);
  });

  it("2. enforces the twenty-five-request trial limit", () => {
    const lifecycle = { status: "TRIALING" as const, currentPeriodEnd: addDays(now, 14), trialEnd: addDays(now, 14) };
    expect(canConsumeRequest({
      lifecycle, usage: { includedRequests: 25, requestsUsed: 24, addOnRequests: 0, manualAdjustment: 0 },
      overageEnabled: false, overageBehavior: "HARD_LIMIT", overageApproved: false, now,
    }).allowed).toBe(true);
    expect(canConsumeRequest({
      lifecycle, usage: { includedRequests: 25, requestsUsed: 25, addOnRequests: 0, manualAdjustment: 0 },
      overageEnabled: false, overageBehavior: "HARD_LIMIT", overageApproved: false, now,
    })).toMatchObject({ allowed: false, reason: "REQUEST_LIMIT_REACHED" });
  });

  it("3. expires a trial at its deadline", () => {
    expect(lifecycleStatus({
      status: "TRIALING", currentPeriodEnd: now, trialEnd: now,
    }, now)).toBe("EXPIRED");
  });

  it("4. provides a new monthly allowance window inside an annual term", () => {
    const start = new Date("2026-01-31T00:00:00.000Z");
    const end = new Date("2027-01-31T00:00:00.000Z");
    const window = usageWindow(start, end, "ANNUAL", new Date("2026-03-15T00:00:00.000Z"), false);
    expect(window.start.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-03-28T00:00:00.000Z");
  });

  it("5. blocks hard limits and permits explicitly approved soft overage", () => {
    const usage = { includedRequests: 150, requestsUsed: 150, addOnRequests: 0, manualAdjustment: 0 };
    expect(canConsumeRequest({ lifecycle: activeLifecycle, usage, overageEnabled: true, overageBehavior: "HARD_LIMIT", overageApproved: true, now }).allowed).toBe(false);
    expect(canConsumeRequest({ lifecycle: activeLifecycle, usage, overageEnabled: true, overageBehavior: "SOFT_LIMIT", overageApproved: false, now }).allowed).toBe(false);
    expect(canConsumeRequest({ lifecycle: activeLifecycle, usage, overageEnabled: true, overageBehavior: "SOFT_LIMIT", overageApproved: true, now })).toMatchObject({ allowed: true, overage: true });
  });

  it("6. calculates a positive immediate upgrade proration", () => {
    expect(proratedUpgradeAmount({
      currentAmount: 19,
      newAmount: 59,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-31T00:00:00.000Z"),
      now: new Date("2026-07-16T00:00:00.000Z"),
    })).toBe(20);
  });

  it("7. identifies downgrade blockers for users and branches", () => {
    expect(downgradeCapacityBlockers({
      current: { companyAdmins: 3, dispatchUsers: 12, branches: 4 },
      next: { companyAdmins: 1, dispatchUsers: 2, branches: 1 },
    })).toEqual(["2 excess company admin(s)", "10 excess dispatch user(s)", "3 excess branch(es)"]);
  });

  it("8. preserves access through a period-end cancellation", () => {
    expect(subscriptionHasAccess({
      status: "CANCELLED", currentPeriodEnd: addDays(now, 5), cancelAtPeriodEnd: true,
    }, now)).toBe(true);
    expect(subscriptionHasAccess({
      status: "CANCELLED", currentPeriodEnd: now, cancelAtPeriodEnd: false,
    }, now)).toBe(false);
  });

  it("9. treats a failed payment as accessible only during its grace period", () => {
    expect(subscriptionHasAccess({
      status: "PAYMENT_FAILED", currentPeriodEnd: addDays(now, 30), gracePeriodEnd: addDays(now, 7),
    }, now)).toBe(true);
  });

  it("10. suspends the account after the payment grace period", () => {
    expect(lifecycleStatus({
      status: "PAYMENT_FAILED", currentPeriodEnd: addDays(now, 20), gracePeriodEnd: now,
    }, now)).toBe("SUSPENDED");
  });

  it("11. calculates percentage, fixed, request-credit, and trial coupons", () => {
    expect(calculateCouponDiscount({ type: "PERCENTAGE", discountValue: 20 }, 100, "USD").discount).toBe(20);
    expect(calculateCouponDiscount({ type: "FIXED_AMOUNT", discountValue: 120 }, 100, "USD").discount).toBe(100);
    expect(calculateCouponDiscount({ type: "REQUEST_CREDITS", discountValue: 100 }, 100, "USD").requestCredits).toBe(100);
    expect(calculateCouponDiscount({ type: "TRIAL_EXTENSION", discountValue: 7 }, 100, "USD").trialDays).toBe(7);
  });

  it("12. consumes add-on entitlement before recording overage", () => {
    const withPack = { includedRequests: 150, requestsUsed: 225, addOnRequests: 100, manualAdjustment: 0 };
    expect(getRemainingRequestsFromUsage(withPack)).toBe(25);
    expect(getOverageRequestsFromUsage(withPack)).toBe(0);
    expect(getOverageRequestsFromUsage({ ...withPack, requestsUsed: 275 })).toBe(25);
  });

  it("13. recognizes a manually activated subscription", () => {
    expect(subscriptionHasAccess({
      status: "MANUALLY_ACTIVATED", currentPeriodEnd: addDays(now, 45),
    }, now)).toBe(true);
  });

  it("14. requires a company scope on every tenant-owned billing model", () => {
    const tenantModels = [
      Subscription, SubscriptionUsage, Invoice, InvoiceItem, CouponRedemption,
      PurchasedAddOn, BillingEvent, ManualPayment, SubscriptionChange, Refund,
    ];
    for (const billingModel of tenantModels) {
      expect(billingModel.schema.path("businessId")?.options.required, billingModel.modelName).toBe(true);
    }
  });

  it("15. validates a Stripe-style signed test webhook", () => {
    const raw = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
    const timestamp = 1_721_736_000;
    const secret = "whsec_test_secret";
    const digest = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    expect(validateStripeWebhookSignature(raw, `t=${timestamp},v1=${digest}`, secret, timestamp)).toBe(true);
    expect(validateStripeWebhookSignature(`${raw}x`, `t=${timestamp},v1=${digest}`, secret, timestamp)).toBe(false);
  });

  it("16. validates a Razorpay-style signed test webhook", () => {
    const raw = JSON.stringify({ id: "rfnd_test", event: "payment.captured" });
    const secret = "razorpay_test_secret";
    const digest = createHmac("sha256", secret).update(raw).digest("hex");
    expect(validateRazorpayWebhookSignature(raw, digest, secret)).toBe(true);
    expect(validateRazorpayWebhookSignature(raw, "bad", secret)).toBe(false);
  });

  it("17. enforces duplicate webhook protection with a unique provider/event index", () => {
    const indexes = PaymentWebhookEvent.schema.indexes();
    expect(indexes.some(([fields, options]) =>
      fields.provider === 1 && fields.externalEventId === 1 && options.unique === true,
    )).toBe(true);
  });

  it("18. supports annual billing and an optional yearly pooled allowance", () => {
    expect(billingPeriodEnd(now, "ANNUAL").toISOString()).toBe("2027-07-23T12:00:00.000Z");
    const pooled = usageWindow(now, addMonths(now, 12), "ANNUAL", addMonths(now, 5), true);
    expect(pooled.start).toEqual(now);
    expect(pooled.end).toEqual(addMonths(now, 12));
  });

  it("19. assigns regional billing without trusting a frontend region value", () => {
    expect(countryToBillingRegion("India")).toBe("INDIA");
    expect(countryToBillingRegion("Canada")).toBe("CANADA");
    expect(countryToBillingRegion("United Arab Emirates")).toBe("MIDDLE_EAST");
    expect(countryToBillingRegion("Brazil")).toBe("OTHER");
  });

  it("20. enforces feature flags only while subscription access is active", () => {
    expect(featureEntitled({
      lifecycle: activeLifecycle,
      featureFlags: { webhooks: true },
      feature: "webhooks",
      now,
    })).toBe(true);
    expect(featureEntitled({
      lifecycle: { status: "SUSPENDED", currentPeriodEnd: addDays(now, 10) },
      featureFlags: { webhooks: true },
      feature: "webhooks",
      now,
    })).toBe(false);
  });

  it("adds manual feature overrides without hardcoded plan comparisons", () => {
    expect(featureEntitled({
      lifecycle: activeLifecycle,
      featureFlags: { api_access: false },
      manualFeatures: ["api_access"],
      feature: "api_access",
      now,
    })).toBe(true);
  });

  it("raises usage warnings at exactly 70, 90, and 100 percent", () => {
    expect(usageWarningThreshold(69)).toBe(0);
    expect(usageWarningThreshold(70)).toBe(70);
    expect(usageWarningThreshold(90)).toBe(90);
    expect(usageWarningThreshold(100)).toBe(100);
  });
});
