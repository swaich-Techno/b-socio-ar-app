/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { dbConnect } from "@/lib/db";
import { getEnvironment } from "@/lib/env";
import { HttpError, ok, readJson } from "@/lib/http";
import {
  AddOnPack,
  Business,
  Coupon,
  PaymentWebhookEvent,
  Plan,
  PlanPrice,
  PurchasedAddOn,
  Subscription,
} from "@/models";
import {
  adjustUsage,
  cancelSubscription,
  completeProviderPayment,
  completeTestPayment,
  createAddOnCheckout,
  createCheckout,
  getAdminBillingMetrics,
  getBillingSummary,
  getInvoiceForBusiness,
  manuallyActivateSubscription,
  markPaymentFailed,
  publicPlan,
  reactivateSubscription,
  recordManualPayment,
  recordProviderRefund,
  renewProviderSubscription,
  runBillingMaintenance,
  scheduleDowngrade,
  validateCouponForBusiness,
} from "./service";
import { validateRazorpayWebhookSignature, validateStripeWebhookSignature } from "./providers";
import { seedBillingDefaults } from "./seed";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const billingPeriodSchema = z.enum(["MONTHLY", "ANNUAL"]);
const checkoutSchema = z.object({
  planId: objectId,
  billingPeriod: billingPeriodSchema,
  couponCode: z.string().trim().min(2).max(64).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();
const couponValidationSchema = z.object({
  code: z.string().trim().min(2).max(64),
  planId: objectId,
  billingPeriod: billingPeriodSchema,
}).strict();
const downgradeSchema = z.object({ planId: objectId }).strict();
const cancellationSchema = z.object({
  timing: z.enum(["IMMEDIATE", "PERIOD_END"]).default("PERIOD_END"),
  reason: z.string().trim().max(1000).optional(),
}).strict();
const testCompletionSchema = z.object({ checkoutId: z.string().startsWith("test_checkout_").max(200) }).strict();
const addOnCheckoutSchema = z.object({
  packId: objectId,
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();
const manualSubscriptionSchema = z.object({
  businessId: objectId,
  planId: objectId,
  currency: z.enum(["INR", "USD", "CAD", "GBP", "EUR", "AED"]),
  customPrice: z.number().nonnegative(),
  startDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  requestLimit: z.number().int().nonnegative().optional(),
  companyAdminLimit: z.number().int().positive().optional(),
  dispatchUserLimit: z.number().int().nonnegative().optional(),
  branchLimit: z.number().int().positive().optional(),
  enabledFeatures: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  paymentStatus: z.string().trim().min(2).max(50),
  internalNotes: z.string().trim().max(5000).optional(),
}).strict().refine((input) => input.expiryDate > input.startDate, {
  path: ["expiryDate"],
  message: "Expiry date must be after the start date.",
});
const manualPaymentSchema = z.object({
  businessId: objectId,
  subscriptionId: objectId.optional(),
  method: z.enum(["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "MANUAL_INVOICE", "OTHER"]),
  paymentReference: z.string().trim().min(2).max(200),
  proofReference: z.string().trim().max(1000).optional(),
  paymentDate: z.coerce.date(),
  amount: z.number().nonnegative(),
  currency: z.enum(["INR", "USD", "CAD", "GBP", "EUR", "AED"]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  internalNotes: z.string().trim().max(5000).optional(),
}).strict();
const usageAdjustmentSchema = z.object({
  businessId: objectId,
  adjustment: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(1000),
}).strict();
const planUpdateSchema = z.object({
  planId: objectId,
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().min(10).max(1000).optional(),
  active: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  limits: z.object({
    monthlyRequests: z.number().int().nonnegative().optional(),
    yearlyPooledRequests: z.number().int().nonnegative().nullable().optional(),
    companyAdmins: z.number().int().positive().optional(),
    dispatchUsers: z.number().int().nonnegative().optional(),
    branches: z.number().int().positive().optional(),
    retentionDays: z.number().int().positive().optional(),
  }).strict().optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  overage: z.object({
    enabled: z.boolean().optional(),
    behavior: z.enum(["HARD_LIMIT", "SOFT_LIMIT"]).optional(),
    requiresApproval: z.boolean().optional(),
    rates: z.record(z.string(), z.number().nonnegative()).optional(),
  }).strict().optional(),
  prices: z.array(z.object({
    priceId: objectId,
    monthlyAmount: z.number().nonnegative(),
    annualAmount: z.number().nonnegative(),
    taxInclusive: z.boolean(),
    stripeMonthlyPriceId: z.string().trim().max(200).optional(),
    stripeAnnualPriceId: z.string().trim().max(200).optional(),
    razorpayMonthlyPlanId: z.string().trim().max(200).optional(),
    razorpayAnnualPlanId: z.string().trim().max(200).optional(),
  }).strict()).max(20).optional(),
}).strict();
const couponCreateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,64}$/),
  description: z.string().trim().min(3).max(1000),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "TRIAL_EXTENSION", "REQUEST_CREDITS", "ONE_TIME", "RECURRING"]),
  eligiblePlanIds: z.array(objectId).max(20).default([]),
  eligibleBillingPeriods: z.array(billingPeriodSchema).max(2).default(["MONTHLY", "ANNUAL"]),
  currency: z.enum(["INR", "USD", "CAD", "GBP", "EUR", "AED"]).optional(),
  discountValue: z.number().nonnegative(),
  maximumRedemptions: z.number().int().positive().optional(),
  startDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  perCompanyUsageLimit: z.number().int().positive().default(1),
  newCustomersOnly: z.boolean().default(false),
  active: z.boolean().default(true),
  recurringCycles: z.number().int().positive().optional(),
}).strict().refine((input) => input.expiryDate > input.startDate, {
  path: ["expiryDate"],
  message: "Expiry date must be after the start date.",
});
const overageApprovalSchema = z.object({ approved: z.boolean() }).strict();
const addOnPackFieldsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  requests: z.number().int().positive(),
  price: z.number().nonnegative(),
  currency: z.enum(["INR", "USD", "CAD", "GBP", "EUR", "AED"]),
  expiryDays: z.number().int().positive().max(3650),
  eligiblePlanIds: z.array(objectId).max(20).default([]),
  active: z.boolean().default(true),
}).strict();
const addOnPackUpdateSchema = z.object({
  packId: objectId,
  name: z.string().trim().min(2).max(120).optional(),
  requests: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.enum(["INR", "USD", "CAD", "GBP", "EUR", "AED"]).optional(),
  expiryDays: z.number().int().positive().max(3650).optional(),
  eligiblePlanIds: z.array(objectId).max(20).optional(),
  active: z.boolean().optional(),
}).strict();

function queryDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function validCronSecret(request: NextRequest): boolean {
  const expected = process.env.BILLING_CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function requireCompanyAuth(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  if (!auth.businessId) throw new HttpError(409, "COMPANY_REQUIRED", "Complete company setup before opening billing.");
  return auth;
}

export async function handleBillingGet(request: NextRequest, path: string): Promise<Response | null> {
  if (path === "billing/summary") {
    const auth = await requireCompanyAuth(request);
    return ok(await getBillingSummary(auth.businessId!));
  }
  if (/^billing\/invoices\/[a-f\d]{24}$/i.test(path)) {
    const auth = await requireCompanyAuth(request);
    return ok(await getInvoiceForBusiness(path.split("/")[2]!, auth.businessId!));
  }
  if (path === "admin/billing/metrics") {
    await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]);
    const url = new URL(request.url);
    return ok(await getAdminBillingMetrics({
      planId: url.searchParams.get("planId") || undefined,
      country: url.searchParams.get("country") || undefined,
      currency: url.searchParams.get("currency") || undefined,
      status: url.searchParams.get("status") || undefined,
      from: queryDate(url.searchParams.get("from")),
      to: queryDate(url.searchParams.get("to")),
    }));
  }
  if (path === "admin/billing/catalog") {
    await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]);
    await dbConnect();
    const [plans, prices, coupons, addOnPacks, businesses, purchasedAddOns] = await Promise.all([
      Plan.find({}).sort({ sortOrder: 1 }).lean(),
      PlanPrice.find({}).sort({ region: 1, currency: 1 }).lean(),
      Coupon.find({}).sort({ createdAt: -1 }).lean(),
      AddOnPack.find({}).sort({ currency: 1, requests: 1 }).lean(),
      Business.find({}).select("name country billingRegion").sort({ name: 1 }).limit(500).lean(),
      PurchasedAddOn.find({}).sort({ purchasedAt: -1 }).limit(100).lean(),
    ]);
    return ok({ plans: plans.map(publicPlan), prices, coupons, addOnPacks, businesses, purchasedAddOns });
  }
  if (/^admin\/billing\/invoices\/[a-f\d]{24}$/i.test(path)) {
    await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]);
    return ok(await getInvoiceForBusiness(path.split("/")[3]!, "", true));
  }
  return null;
}

export async function handleBillingPost(request: NextRequest, path: string): Promise<Response | null> {
  if (path === "webhooks/stripe" || path === "webhooks/razorpay") return handlePaymentWebhook(request, path);
  if (path === "billing/maintenance") {
    if (!validCronSecret(request)) throw new HttpError(401, "INVALID_CRON_SECRET", "Billing maintenance authorization failed.");
    return ok(await runBillingMaintenance());
  }
  if (path === "billing/coupons/validate") {
    const auth = await requireCompanyAuth(request);
    const input = await readJson(request, couponValidationSchema);
    const summary = await getBillingSummary(auth.businessId!);
    const plan = summary.plans.find((item: { _id: string }) => item._id === input.planId);
    if (!plan?.price) throw new HttpError(409, "REGIONAL_PRICE_UNAVAILABLE", "No regional price is available.");
    const subtotal = input.billingPeriod === "ANNUAL" ? plan.price.annualAmount : plan.price.monthlyAmount;
    const result = await validateCouponForBusiness({
      businessId: auth.businessId!,
      code: input.code,
      planId: input.planId,
      billingPeriod: input.billingPeriod,
      currency: plan.price.currency,
      subtotal,
    });
    return ok({ code: result.coupon.code, description: result.coupon.description, benefit: result.benefit });
  }
  if (path === "billing/checkout") {
    const auth = await requireCompanyAuth(request);
    const input = await readJson(request, checkoutSchema);
    const result = await createCheckout({
      businessId: auth.businessId!,
      customerId: auth.id,
      customerEmail: auth.email,
      planId: input.planId,
      billingPeriod: input.billingPeriod,
      couponCode: input.couponCode,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      appUrl: getEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
    });
    await writeAudit({
      actorId: auth.id, businessId: auth.businessId, action: "BILLING_CHECKOUT_CREATED",
      entityType: "Payment", entityId: result.payment._id.toString(), request,
      after: { planId: input.planId, billingPeriod: input.billingPeriod, amount: result.amount, currency: result.currency, isTest: result.checkout.isTest },
    });
    return ok({
      checkoutUrl: result.checkout.checkoutUrl,
      checkoutId: result.checkout.checkoutId,
      isTest: result.checkout.isTest,
      amount: result.amount,
      currency: result.currency,
    }, 201);
  }
  if (path === "billing/test-payments/complete") {
    const auth = await requireCompanyAuth(request);
    if (process.env.BILLING_TEST_MODE === "false") throw new HttpError(404, "TEST_MODE_DISABLED", "Test billing mode is disabled.");
    const input = await readJson(request, testCompletionSchema);
    const result = await completeTestPayment(auth.businessId!, input.checkoutId);
    await writeAudit({
      actorId: auth.id, businessId: auth.businessId, action: "TEST_PAYMENT_COMPLETED",
      entityType: "Payment", entityId: result.payment._id.toString(), request, after: { isTest: true },
    });
    return ok({ message: "Test transaction completed. It is recorded as test data.", invoiceId: result.invoice?._id });
  }
  if (path === "billing/downgrade") {
    const auth = await requireCompanyAuth(request);
    const input = await readJson(request, downgradeSchema);
    return ok(await scheduleDowngrade({ businessId: auth.businessId!, planId: input.planId, actorId: auth.id }));
  }
  if (path === "billing/cancel") {
    const auth = await requireCompanyAuth(request);
    const input = await readJson(request, cancellationSchema);
    return ok(await cancelSubscription({ businessId: auth.businessId!, actorId: auth.id, timing: input.timing ?? "PERIOD_END", reason: input.reason }));
  }
  if (path === "billing/reactivate") {
    const auth = await requireCompanyAuth(request);
    return ok(await reactivateSubscription(auth.businessId!, auth.id));
  }
  if (path === "billing/add-ons/checkout") {
    const auth = await requireCompanyAuth(request);
    const input = await readJson(request, addOnCheckoutSchema);
    const result = await createAddOnCheckout({
      businessId: auth.businessId!,
      customerId: auth.id,
      customerEmail: auth.email,
      packId: input.packId,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
      appUrl: getEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
    });
    return ok({ checkoutUrl: result.checkout.checkoutUrl, checkoutId: result.checkout.checkoutId, isTest: result.checkout.isTest }, 201);
  }
  if (path === "billing/overage-approval") {
    const auth = await requireCompanyAuth(request);
    const input = await readJson(request, overageApprovalSchema);
    const subscription = await Subscription.findOneAndUpdate(
      { businessId: auth.businessId },
      { $set: { overageApproved: input.approved } },
      { new: true },
    );
    if (!subscription) throw new HttpError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
    await writeAudit({
      actorId: auth.id, businessId: auth.businessId, action: input.approved ? "OVERAGE_APPROVED" : "OVERAGE_REVOKED",
      entityType: "Subscription", entityId: subscription._id.toString(), request,
    });
    return ok({ overageApproved: subscription.overageApproved });
  }
  if (path === "admin/billing/seed") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = z.object({ includeSamples: z.boolean().default(false) }).strict().parse(await request.json().catch(() => ({})));
    const result = await seedBillingDefaults({ includeSamples: input.includeSamples });
    await writeAudit({ actorId: auth.id, action: "BILLING_DEFAULTS_SEEDED", entityType: "BillingCatalog", request, after: result });
    return ok(result);
  }
  if (path === "admin/billing/manual-subscriptions") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = await readJson(request, manualSubscriptionSchema);
    const subscription = await manuallyActivateSubscription({ ...input, actorId: auth.id });
    await writeAudit({
      actorId: auth.id, businessId: input.businessId, action: "MANUAL_SUBSCRIPTION_ACTIVATED",
      entityType: "Subscription", entityId: subscription._id.toString(), request,
      after: { planId: input.planId, expiryDate: input.expiryDate, requestLimit: input.requestLimit, paymentStatus: input.paymentStatus },
    });
    return ok(subscription, 201);
  }
  if (path === "admin/billing/manual-payments") {
    const auth = await requireAuth(request, ["SUPER_ADMIN", "FINANCE_MANAGER"]);
    const input = await readJson(request, manualPaymentSchema);
    const payment = await recordManualPayment({ ...input, actorId: auth.id });
    await writeAudit({
      actorId: auth.id, businessId: input.businessId, action: `MANUAL_PAYMENT_${input.status}`,
      entityType: "ManualPayment", entityId: payment._id.toString(), request,
      after: { method: input.method, amount: input.amount, currency: input.currency, status: input.status },
    });
    return ok(payment, 201);
  }
  if (path === "admin/billing/usage-adjustments") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = await readJson(request, usageAdjustmentSchema);
    const usage = await adjustUsage({ ...input, actorId: auth.id });
    await writeAudit({
      actorId: auth.id, businessId: input.businessId, action: "SUBSCRIPTION_USAGE_ADJUSTED",
      entityType: "SubscriptionUsage", entityId: usage._id.toString(), request,
      after: { adjustment: input.adjustment, reason: input.reason },
    });
    return ok(usage);
  }
  if (path === "admin/billing/coupons") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = await readJson(request, couponCreateSchema);
    const coupon = await Coupon.create(input);
    await writeAudit({
      actorId: auth.id, action: "COUPON_CREATED", entityType: "Coupon", entityId: coupon._id.toString(), request,
      after: { code: coupon.code, type: coupon.type, discountValue: coupon.discountValue },
    });
    return ok(coupon, 201);
  }
  if (path === "admin/billing/add-ons") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = await readJson(request, addOnPackFieldsSchema);
    const pack = await AddOnPack.create(input);
    await writeAudit({
      actorId: auth.id, action: "ADD_ON_PACK_CREATED", entityType: "AddOnPack", entityId: pack._id.toString(), request,
      after: { name: pack.name, requests: pack.requests, price: pack.price, currency: pack.currency, active: pack.active },
    });
    return ok(pack, 201);
  }
  if (path === "admin/billing/run-maintenance") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const result = await runBillingMaintenance();
    await writeAudit({ actorId: auth.id, action: "BILLING_MAINTENANCE_RUN", entityType: "Subscription", request, after: result });
    return ok(result);
  }
  return null;
}

export async function handleBillingPatch(request: NextRequest, path: string): Promise<Response | null> {
  if (path === "admin/billing/plans") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = await readJson(request, planUpdateSchema);
    const current = await Plan.findById(input.planId);
    if (!current) throw new HttpError(404, "PLAN_NOT_FOUND", "Plan not found.");
    const before = publicPlan(current);
    const set: Record<string, unknown> = {};
    for (const key of ["name", "description", "active", "trialDays"] as const) {
      if (input[key] !== undefined) set[key] = input[key];
    }
    if (input.limits) for (const [key, value] of Object.entries(input.limits)) set[`limits.${key}`] = value;
    if (input.featureFlags) for (const [key, value] of Object.entries(input.featureFlags)) set[`featureFlags.${key}`] = value;
    if (input.overage) {
      for (const [key, value] of Object.entries(input.overage)) {
        if (key === "rates" && value) for (const [currency, rate] of Object.entries(value)) set[`overage.rates.${currency}`] = rate;
        else set[`overage.${key}`] = value;
      }
    }
    const plan = await Plan.findByIdAndUpdate(input.planId, { $set: set }, { new: true, runValidators: true });
    for (const price of input.prices ?? []) {
      await PlanPrice.updateOne(
        { _id: price.priceId, planId: input.planId },
        {
          $set: {
            monthlyAmount: price.monthlyAmount,
            annualAmount: price.annualAmount,
            taxInclusive: price.taxInclusive,
            "stripePriceIds.monthly": price.stripeMonthlyPriceId,
            "stripePriceIds.annual": price.stripeAnnualPriceId,
            "razorpayPlanIds.monthly": price.razorpayMonthlyPlanId,
            "razorpayPlanIds.annual": price.razorpayAnnualPlanId,
          },
        },
        { runValidators: true },
      );
    }
    await writeAudit({
      actorId: auth.id, action: "BILLING_PLAN_UPDATED", entityType: "Plan", entityId: input.planId, request,
      before, after: publicPlan(plan!),
    });
    return ok(publicPlan(plan!));
  }
  if (path === "admin/billing/add-ons") {
    const auth = await requireAuth(request, ["SUPER_ADMIN"]);
    const input = await readJson(request, addOnPackUpdateSchema);
    const current = await AddOnPack.findById(input.packId);
    if (!current) throw new HttpError(404, "ADD_ON_PACK_NOT_FOUND", "Add-on pack not found.");
    const before = current.toObject();
    const { packId, ...changes } = input;
    const pack = await AddOnPack.findByIdAndUpdate(packId, { $set: changes }, { new: true, runValidators: true });
    await writeAudit({
      actorId: auth.id, action: "ADD_ON_PACK_UPDATED", entityType: "AddOnPack", entityId: packId, request,
      before, after: pack?.toObject(),
    });
    return ok(pack);
  }
  return null;
}

async function handlePaymentWebhook(request: NextRequest, path: string) {
  const provider = path.endsWith("stripe") ? "STRIPE" : "RAZORPAY";
  const rawBody = await request.text();
  const signatureValid = provider === "STRIPE"
    ? validateStripeWebhookSignature(rawBody, request.headers.get("stripe-signature"))
    : validateRazorpayWebhookSignature(rawBody, request.headers.get("x-razorpay-signature"));
  if (!signatureValid) throw new HttpError(400, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature validation failed.");
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "INVALID_WEBHOOK_PAYLOAD", "Webhook payload is invalid JSON.");
  }
  const externalEventId = String(payload.id ?? request.headers.get("x-razorpay-event-id") ?? "");
  const eventType = String(payload.type ?? payload.event ?? "unknown");
  if (!externalEventId) throw new HttpError(400, "WEBHOOK_EVENT_ID_REQUIRED", "Webhook event ID is required.");
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  let event;
  try {
    event = await PaymentWebhookEvent.create({ provider, externalEventId, eventType, payloadHash, status: "RECEIVED" });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return ok({ received: true, duplicate: true });
    throw error;
  }
  try {
    if (provider === "STRIPE") await processStripeEvent(eventType, payload);
    else await processRazorpayEvent(eventType, payload);
    event.status = "PROCESSED";
    event.processedAt = new Date();
    await event.save();
    return ok({ received: true, duplicate: false });
  } catch (error) {
    event.status = "FAILED";
    event.error = error instanceof Error ? error.message.slice(0, 2000) : "Webhook processing failed";
    await event.save();
    throw error;
  }
}

async function processStripeEvent(eventType: string, payload: Record<string, any>) {
  const object = payload.data?.object ?? {};
  if (eventType === "checkout.session.completed") {
    await completeProviderPayment("STRIPE", String(object.id), String(object.payment_intent ?? object.subscription ?? object.id));
    return;
  }
  if (eventType === "invoice.paid") {
    const providerSubscriptionId = String(object.subscription ?? object.id);
    const providerPaymentId = String(object.payment_intent ?? object.id);
    const completed = await completeProviderPayment("STRIPE", providerSubscriptionId, providerPaymentId);
    if (!completed) {
      await renewProviderSubscription({
        provider: "STRIPE",
        providerSubscriptionId,
        providerPaymentId,
        amount: typeof object.amount_paid === "number" ? object.amount_paid / 100 : undefined,
        currency: object.currency,
      });
    }
    return;
  }
  if (eventType === "invoice.payment_failed") {
    await markPaymentFailed("STRIPE", String(object.subscription ?? object.id));
    return;
  }
  if (["charge.refunded", "refund.created", "refund.updated"].includes(eventType)) {
    const refundObject = eventType === "charge.refunded" ? object.refunds?.data?.[0] ?? object : object;
    await recordProviderRefund({
      provider: "STRIPE",
      providerPaymentId: String(object.payment_intent ?? object.payment ?? ""),
      providerRefundId: String(refundObject.id ?? object.id),
      amount: typeof refundObject.amount === "number"
        ? refundObject.amount / 100
        : typeof object.amount_refunded === "number" ? object.amount_refunded / 100 : undefined,
      currency: refundObject.currency ?? object.currency,
      reason: refundObject.reason,
      succeeded: eventType === "charge.refunded" || refundObject.status === "succeeded",
    });
    return;
  }
  if (eventType === "customer.subscription.deleted") {
    await Subscription.updateOne(
      { provider: "STRIPE", providerSubscriptionId: String(object.id) },
      { $set: { status: "CANCELLED", cancelAtPeriodEnd: false, cancellationDate: new Date(), renewalDate: null } },
    );
  }
}

async function processRazorpayEvent(eventType: string, payload: Record<string, any>) {
  const subscription = payload.payload?.subscription?.entity;
  const paymentLink = payload.payload?.payment_link?.entity;
  const payment = payload.payload?.payment?.entity;
  const refund = payload.payload?.refund?.entity;
  const reference = String(subscription?.id ?? paymentLink?.id ?? payment?.notes?.checkoutId ?? "");
  if (["subscription.activated", "subscription.charged", "payment_link.paid", "payment.captured"].includes(eventType)) {
    const providerPaymentId = String(payment?.id ?? subscription?.id ?? paymentLink?.id);
    const completed = await completeProviderPayment("RAZORPAY", reference, providerPaymentId);
    if (!completed && eventType === "subscription.charged") {
      await renewProviderSubscription({
        provider: "RAZORPAY",
        providerSubscriptionId: reference,
        providerPaymentId,
        amount: typeof payment?.amount === "number" ? payment.amount / 100 : undefined,
        currency: payment?.currency,
      });
    }
    return;
  }
  if (["payment.failed", "subscription.pending", "subscription.halted"].includes(eventType)) {
    await markPaymentFailed("RAZORPAY", reference);
    return;
  }
  if (["refund.created", "refund.processed"].includes(eventType)) {
    await recordProviderRefund({
      provider: "RAZORPAY",
      providerPaymentId: String(refund?.payment_id ?? payment?.id ?? ""),
      providerRefundId: String(refund?.id ?? ""),
      amount: typeof refund?.amount === "number" ? refund.amount / 100 : undefined,
      currency: refund?.currency,
      reason: refund?.notes?.reason,
      succeeded: eventType === "refund.processed" || refund?.status === "processed",
    });
    return;
  }
  if (eventType === "subscription.cancelled") {
    await Subscription.updateOne(
      { provider: "RAZORPAY", providerSubscriptionId: reference },
      { $set: { status: "CANCELLED", cancelAtPeriodEnd: false, cancellationDate: new Date(), renewalDate: null } },
    );
  }
}
