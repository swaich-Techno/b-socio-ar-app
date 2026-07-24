/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { HttpError } from "@/lib/http";
import { sendBillingNotificationEmail } from "@/services/email";
import {
  AddOnPack,
  BillingEvent,
  Branch,
  Business,
  Coupon,
  CouponRedemption,
  Invoice,
  InvoiceItem,
  ManualPayment,
  Notification,
  Payment,
  Plan,
  PlanPrice,
  PurchasedAddOn,
  Refund,
  Subscription,
  SubscriptionChange,
  SubscriptionUsage,
  User,
} from "@/models";
import {
  addDays,
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
  usagePercentage,
  usageWarningThreshold,
  usageWindow,
  type BillingPeriod,
} from "./domain";
import { defaultProviderForRegion, gatewayFor, type PaymentProviderName } from "./providers";
import { seedBillingDefaults } from "./seed";

type AnyDocument = Record<string, any>;

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function asPlainMap(value: unknown): Record<string, boolean | number> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (value && typeof value === "object") return { ...(value as Record<string, boolean | number>) };
  return {};
}

export function publicPlan(plan: AnyDocument) {
  const source = typeof plan.toObject === "function" ? plan.toObject() : plan;
  return {
    ...source,
    _id: String(source._id),
    featureFlags: asPlainMap(source.featureFlags),
    overage: { ...source.overage, rates: asPlainMap(source.overage?.rates) },
  };
}

export async function ensureBillingCatalog(): Promise<void> {
  if (!(await Plan.exists({ code: "FREE_TRIAL" }))) await seedBillingDefaults();
}

async function billingBusiness(businessId: string) {
  const business = await Business.findById(businessId);
  if (!business) throw new HttpError(404, "COMPANY_NOT_FOUND", "Company billing account not found.");
  if (!business.billingRegion) {
    business.billingRegion = countryToBillingRegion(business.country);
    await business.save();
  }
  return business;
}

async function notifyBusiness(
  businessId: string,
  type: string,
  title: string,
  message: string,
  subscriptionId?: string,
  metadata: Record<string, unknown> = {},
) {
  const users = await User.find({ businessId, role: "CUSTOMER" }).select("_id email").lean();
  if (users.length) {
    await Notification.insertMany(users.map((user) => ({
      userId: user._id,
      businessId,
      type,
      title,
      message,
      href: "/dashboard/billing",
    })));
  }
  const emailResults = await Promise.allSettled(
    (users as unknown as Array<{ email: string }>).map((user) => sendBillingNotificationEmail(user.email, title, message)),
  );
  if (emailResults.some((result) => result.status === "rejected") && process.env.NODE_ENV !== "test") {
    console.warn("One or more billing notification emails could not be sent.");
  }
  await BillingEvent.create({ businessId, subscriptionId, type, metadata });
}

export async function startTrialSubscription(businessId: string, actorId?: string) {
  await ensureBillingCatalog();
  const existing = await Subscription.findOne({ businessId });
  if (existing) return existing;
  const business = await billingBusiness(businessId);
  const plan = await Plan.findOne({ code: "FREE_TRIAL", active: true });
  if (!plan) throw new Error("The Free Trial billing plan is unavailable.");
  const start = new Date();
  const end = billingPeriodEnd(start, "TRIAL", plan.trialDays || 14);
  const subscription = await Subscription.create({
    businessId: business._id,
    planId: plan._id,
    billingPeriod: "TRIAL",
    currency: business.billingRegion === "INDIA" ? "INR" : "USD",
    basePrice: 0,
    discount: 0,
    tax: 0,
    finalPayableAmount: 0,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    trialStart: start,
    trialEnd: end,
    renewalDate: end,
    status: "TRIALING",
    provider: "MANUAL",
    assignedRegion: business.billingRegion,
    paymentStatus: "NOT_REQUIRED",
  });
  await SubscriptionUsage.create({
    businessId: business._id,
    subscriptionId: subscription._id,
    billingCycleStart: start,
    billingCycleEnd: end,
    includedRequests: plan.limits.monthlyRequests,
    requestsUsed: 0,
  });
  await notifyBusiness(
    businessId,
    "TRIAL_STARTED",
    "Your free trial has started",
    `Your ${plan.trialDays}-day trial includes ${plan.limits.monthlyRequests} secure request links.`,
    subscription._id.toString(),
    { actorId },
  );
  return subscription;
}

export async function synchronizeSubscriptionState(subscription: AnyDocument, now = new Date()) {
  const nextStatus = lifecycleStatus({
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEnd: subscription.trialEnd,
    gracePeriodEnd: subscription.gracePeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  }, now);
  if (nextStatus === subscription.status) return subscription;
  const previous = subscription.status;
  subscription.status = nextStatus;
  if (nextStatus === "EXPIRED" || nextStatus === "SUSPENDED") subscription.renewalDate = undefined;
  await subscription.save();
  const type = nextStatus === "EXPIRED" && previous === "TRIALING" ? "TRIAL_EXPIRED" : `SUBSCRIPTION_${nextStatus}`;
  await notifyBusiness(
    subscription.businessId.toString(),
    type,
    nextStatus === "SUSPENDED" ? "Billing access suspended" : "Subscription status changed",
    nextStatus === "SUSPENDED"
      ? "The payment grace period ended. New location requests are now restricted."
      : `Your subscription is now ${nextStatus.toLowerCase().replaceAll("_", " ")}.`,
    subscription._id.toString(),
  );
  return subscription;
}

async function subscriptionWithPlan(businessId: string) {
  let subscription = await Subscription.findOne({ businessId });
  if (!subscription) subscription = await startTrialSubscription(businessId);
  await synchronizeSubscriptionState(subscription);
  const plan = await Plan.findById(subscription.planId);
  if (!plan) throw new HttpError(409, "PLAN_UNAVAILABLE", "The assigned subscription plan is unavailable.");
  return { subscription, plan };
}

function effectiveLimit(subscription: AnyDocument, plan: AnyDocument, key: string): number {
  const overrideKey: Record<string, string> = {
    monthlyRequests: "requestLimit",
    companyAdmins: "companyAdminLimit",
    dispatchUsers: "dispatchUserLimit",
    branches: "branchLimit",
  };
  const mappedKey = overrideKey[key];
  const override = mappedKey ? subscription.manualOverrides?.[mappedKey] : undefined;
  return typeof override === "number" ? override : Number(plan.limits?.[key] ?? 0);
}

async function activeAddOnRemaining(businessId: string, subscriptionId: string, now = new Date()) {
  const items = await PurchasedAddOn.find({
    businessId,
    subscriptionId,
    status: "ACTIVE",
    expiresAt: { $gt: now },
  }).sort({ expiresAt: 1 });
  return {
    items,
    remaining: items.reduce((sum, item) => sum + Math.max(0, item.requestsPurchased - item.requestsUsed), 0),
  };
}

export async function getOrCreateCurrentUsage(subscription: AnyDocument, plan: AnyDocument, now = new Date()) {
  const window = usageWindow(
    new Date(subscription.currentPeriodStart),
    new Date(subscription.currentPeriodEnd),
    subscription.billingPeriod as BillingPeriod,
    now,
    Boolean(plan.limits.yearlyPooledRequests),
  );
  let usage = await SubscriptionUsage.findOne({ subscriptionId: subscription._id, billingCycleStart: window.start })
    .select("+consumptionKeys");
  const addOns = await activeAddOnRemaining(subscription.businessId.toString(), subscription._id.toString(), now);
  if (!usage) {
    usage = await SubscriptionUsage.findOneAndUpdate(
      { subscriptionId: subscription._id, billingCycleStart: window.start },
      {
        $setOnInsert: {
          businessId: subscription.businessId,
          subscriptionId: subscription._id,
          billingCycleStart: window.start,
          billingCycleEnd: window.end,
          includedRequests: effectiveLimit(subscription, plan, "monthlyRequests"),
          requestsUsed: 0,
          addOnRequests: addOns.remaining,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).select("+consumptionKeys");
  } else if (usage.addOnRequests !== addOns.remaining + usage.addOnRequestsUsed) {
    usage.addOnRequests = addOns.remaining + usage.addOnRequestsUsed;
    await usage.save();
  }
  return usage;
}

export async function isSubscriptionActive(businessId: string): Promise<boolean> {
  const { subscription } = await subscriptionWithPlan(businessId);
  return subscriptionHasAccess(subscription);
}

export async function getRemainingRequests(businessId: string): Promise<number> {
  const { subscription, plan } = await subscriptionWithPlan(businessId);
  const usage = await getOrCreateCurrentUsage(subscription, plan);
  return getRemainingRequestsFromUsage(usage);
}

export async function hasFeature(businessId: string, feature: string): Promise<boolean> {
  const { subscription, plan } = await subscriptionWithPlan(businessId);
  const flags = asPlainMap(plan.featureFlags);
  return featureEntitled({
    lifecycle: subscription,
    featureFlags: flags as Record<string, boolean>,
    manualFeatures: subscription.manualOverrides?.enabledFeatures,
    feature,
  });
}

export async function requireFeature(businessId: string, feature: string): Promise<void> {
  if (!(await hasFeature(businessId, feature))) {
    throw new HttpError(403, "FEATURE_NOT_INCLUDED", `Your subscription does not include ${feature.replaceAll("_", " ")}.`);
  }
}

export async function canAddUser(
  businessId: string,
  companyRole: "COMPANY_ADMIN" | "DISPATCH",
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const { subscription, plan } = await subscriptionWithPlan(businessId);
  if (!subscriptionHasAccess(subscription)) return { allowed: false, used: 0, limit: 0 };
  const limit = effectiveLimit(subscription, plan, companyRole === "COMPANY_ADMIN" ? "companyAdmins" : "dispatchUsers");
  const used = await User.countDocuments({ businessId, role: "CUSTOMER", companyRole });
  return { allowed: used < limit, used, limit };
}

export async function canAddBranch(businessId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const { subscription, plan } = await subscriptionWithPlan(businessId);
  if (!subscriptionHasAccess(subscription)) return { allowed: false, used: 0, limit: 0 };
  const limit = effectiveLimit(subscription, plan, "branches");
  const used = await Branch.countDocuments({ businessId, active: true });
  return { allowed: used < limit, used, limit };
}

export async function canCreateLocationRequest(businessId: string) {
  const { subscription, plan } = await subscriptionWithPlan(businessId);
  const usage = await getOrCreateCurrentUsage(subscription, plan);
  const result = canConsumeRequest({
    lifecycle: subscription,
    usage,
    overageEnabled: Boolean(plan.overage?.enabled),
    overageBehavior: plan.overage?.behavior ?? "HARD_LIMIT",
    overageApproved: Boolean(subscription.overageApproved),
  });
  return {
    ...result,
    usage,
    subscription,
    plan,
    remaining: getRemainingRequestsFromUsage(usage),
  };
}

export async function consumeLocationRequest(
  businessId: string,
  idempotencyKey: string,
  metadata: Record<string, unknown> = {},
) {
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new HttpError(422, "IDEMPOTENCY_KEY_REQUIRED", "A valid request idempotency key is required.");
  }
  const check = await canCreateLocationRequest(businessId);
  if (!check.allowed) {
    throw new HttpError(
      409,
      check.reason ?? "REQUEST_NOT_ALLOWED",
      check.reason === "REQUEST_LIMIT_REACHED"
        ? "Monthly request limit reached. Upgrade your plan or contact support."
        : "Your subscription does not currently allow new location requests.",
    );
  }
  const entitlement = check.usage.includedRequests + check.usage.addOnRequests + check.usage.manualAdjustment;
  const filter: AnyDocument = { _id: check.usage._id, consumptionKeys: { $ne: idempotencyKey } };
  if (!check.overage) filter.requestsUsed = { $lt: entitlement };
  const previousUsed = check.usage.requestsUsed;
  const usage = await SubscriptionUsage.findOneAndUpdate(
    filter,
    { $inc: { requestsUsed: 1 }, $addToSet: { consumptionKeys: idempotencyKey } },
    { new: true },
  ).select("+consumptionKeys");
  if (!usage) {
    const duplicate = await SubscriptionUsage.findOne({ _id: check.usage._id, consumptionKeys: idempotencyKey })
      .select("+consumptionKeys");
    if (duplicate) {
      return { usage: duplicate, duplicate: true, remaining: getRemainingRequestsFromUsage(duplicate) };
    }
    throw new HttpError(409, "REQUEST_LIMIT_REACHED", "Monthly request limit reached. Upgrade your plan or contact support.");
  }

  const addOnUsed = Math.min(Math.max(usage.requestsUsed - usage.includedRequests - usage.manualAdjustment, 0), usage.addOnRequests);
  const overageRequests = getOverageRequestsFromUsage(usage);
  usage.addOnRequestsUsed = addOnUsed;
  usage.overageRequests = overageRequests;
  await usage.save();
  if (addOnUsed > check.usage.addOnRequestsUsed) {
    const addOns = await activeAddOnRemaining(businessId, check.subscription._id.toString());
    const item = addOns.items.find((candidate) => candidate.requestsUsed < candidate.requestsPurchased);
    if (item) {
      item.requestsUsed += 1;
      if (item.requestsUsed >= item.requestsPurchased) item.status = "EXHAUSTED";
      await item.save();
    }
  }
  await BillingEvent.create({
    businessId,
    subscriptionId: check.subscription._id,
    type: "REQUEST_LINK_CREATED",
    idempotencyKey,
    metadata: { ...metadata, overage: overageRequests > 0 },
  });

  const beforeThreshold = usageWarningThreshold(
    usagePercentage({ ...usage.toObject(), requestsUsed: previousUsed }),
  );
  const afterThreshold = usageWarningThreshold(usagePercentage(usage));
  if (afterThreshold > beforeThreshold) {
    await notifyBusiness(
      businessId,
      `USAGE_${afterThreshold}`,
      `${afterThreshold}% of request allowance used`,
      afterThreshold === 100
        ? "Your included request allowance is exhausted."
        : `Your company has used ${afterThreshold}% of this billing cycle's request allowance.`,
      check.subscription._id.toString(),
    );
  }
  if (check.subscription.status === "TRIALING" && usage.requestsUsed >= usage.includedRequests) {
    check.subscription.status = "EXPIRED";
    await check.subscription.save();
    await notifyBusiness(
      businessId,
      "TRIAL_EXPIRED",
      "Your free trial request allowance is exhausted",
      "Upgrade to create more location requests. Existing records remain visible under your retention policy.",
      check.subscription._id.toString(),
    );
  }
  return { usage, duplicate: false, remaining: getRemainingRequestsFromUsage(usage) };
}

export async function validateCouponForBusiness(input: {
  businessId: string;
  code: string;
  planId: string;
  billingPeriod: "MONTHLY" | "ANNUAL";
  currency: string;
  subtotal: number;
}) {
  const now = new Date();
  const coupon = await Coupon.findOne({
    code: input.code.trim().toUpperCase(),
    active: true,
    startDate: { $lte: now },
    expiryDate: { $gt: now },
  });
  if (!coupon) throw new HttpError(422, "COUPON_INVALID", "This promotional code is invalid or expired.");
  if (coupon.maximumRedemptions && coupon.redemptionCount >= coupon.maximumRedemptions) {
    throw new HttpError(422, "COUPON_REDEMPTIONS_EXHAUSTED", "This promotional code has reached its redemption limit.");
  }
  if (coupon.eligiblePlanIds.length && !coupon.eligiblePlanIds.some((id: AnyDocument) => id.toString() === input.planId)) {
    throw new HttpError(422, "COUPON_PLAN_INELIGIBLE", "This promotional code is not valid for the selected plan.");
  }
  if (coupon.eligibleBillingPeriods.length && !coupon.eligibleBillingPeriods.includes(input.billingPeriod)) {
    throw new HttpError(422, "COUPON_PERIOD_INELIGIBLE", "This promotional code is not valid for that billing period.");
  }
  const companyRedemptions = await CouponRedemption.countDocuments({ couponId: coupon._id, businessId: input.businessId });
  if (companyRedemptions >= coupon.perCompanyUsageLimit) {
    throw new HttpError(422, "COUPON_COMPANY_LIMIT", "This company has already used this promotional code.");
  }
  if (coupon.newCustomersOnly && await Payment.exists({ businessId: input.businessId, status: { $in: ["VERIFIED", "COMPLETED"] } })) {
    throw new HttpError(422, "COUPON_NEW_CUSTOMERS_ONLY", "This promotional code is for new customers only.");
  }
  const benefit = calculateCouponDiscount(coupon, input.subtotal, input.currency);
  if (coupon.currency && coupon.currency !== input.currency) {
    throw new HttpError(422, "COUPON_CURRENCY_INELIGIBLE", "This promotional code is not valid for the selected currency.");
  }
  return { coupon, benefit };
}

export async function createCheckout(input: {
  businessId: string;
  customerId: string;
  customerEmail: string;
  planId: string;
  billingPeriod: "MONTHLY" | "ANNUAL";
  couponCode?: string;
  idempotencyKey: string;
  appUrl: string;
}) {
  await ensureBillingCatalog();
  const business = await billingBusiness(input.businessId);
  const { subscription, plan: currentPlan } = await subscriptionWithPlan(input.businessId);
  const plan = await Plan.findOne({ _id: input.planId, active: true });
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Subscription plan not found.");
  if (plan.enterprise) throw new HttpError(409, "ENTERPRISE_APPROVAL_REQUIRED", "Enterprise plans require B Socio super-admin approval.");
  const price = await PlanPrice.findOne({ planId: plan._id, region: business.billingRegion, active: true });
  if (!price) throw new HttpError(409, "REGIONAL_PRICE_UNAVAILABLE", "No active price is configured for this company billing region.");
  const fullPrice = input.billingPeriod === "ANNUAL" ? price.annualAmount : price.monthlyAmount;
  const upgrading = plan.sortOrder > currentPlan.sortOrder && subscription.status !== "TRIALING";
  const subtotal = upgrading
    ? proratedUpgradeAmount({
      currentAmount: subscription.basePrice,
      newAmount: fullPrice,
      periodStart: new Date(subscription.currentPeriodStart),
      periodEnd: new Date(subscription.currentPeriodEnd),
    })
    : fullPrice;
  let coupon: AnyDocument | undefined;
  let discount = 0;
  let requestCredits = 0;
  let trialDays = 0;
  if (input.couponCode) {
    const validated = await validateCouponForBusiness({
      businessId: input.businessId,
      code: input.couponCode,
      planId: plan._id.toString(),
      billingPeriod: input.billingPeriod,
      currency: price.currency,
      subtotal,
    });
    coupon = validated.coupon;
    ({ discount, requestCredits, trialDays } = validated.benefit);
  }
  const amount = Math.max(0, subtotal - discount);
  const provider = defaultProviderForRegion(business.billingRegion) as PaymentProviderName;
  const payment = await Payment.create({
    customerId: input.customerId,
    businessId: business._id,
    subscriptionId: subscription._id,
    purpose: upgrading ? "UPGRADE" : "SUBSCRIPTION",
    targetPlanId: plan._id,
    targetBillingPeriod: input.billingPeriod,
    couponId: coupon?._id,
    method: provider === "TEST" ? "TEST" : "CARD",
    provider,
    transactionReference: `PENDING-${randomBytes(8).toString("hex").toUpperCase()}`,
    amount,
    currency: price.currency,
    isTest: provider === "TEST",
    status: provider === "TEST" ? "TEST_PENDING" : "PENDING",
    metadata: { fullPrice, subtotal, discount, requestCredits, trialDays, region: business.billingRegion },
  });
  try {
    const providerPriceId = provider === "STRIPE"
      ? price.stripePriceIds?.[input.billingPeriod.toLowerCase()]
      : provider === "RAZORPAY"
        ? price.razorpayPlanIds?.[input.billingPeriod.toLowerCase()]
        : undefined;
    const checkout = await gatewayFor(provider).createCheckout({
      provider,
      businessId: input.businessId,
      subscriptionId: subscription._id.toString(),
      customerEmail: input.customerEmail,
      currency: price.currency,
      amount,
      billingPeriod: input.billingPeriod,
      description: `${plan.name} ${input.billingPeriod.toLowerCase()} subscription`,
      providerPriceId,
      successUrl: `${input.appUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${input.appUrl}/dashboard/billing?checkout=cancelled`,
      idempotencyKey: input.idempotencyKey,
    });
    payment.providerCheckoutId = checkout.checkoutId;
    payment.providerSubscriptionId = checkout.providerSubscriptionId;
    payment.isTest = checkout.isTest;
    payment.transactionReference = checkout.checkoutId;
    await payment.save();
    await BillingEvent.create({
      businessId: business._id,
      subscriptionId: subscription._id,
      type: "CHECKOUT_CREATED",
      idempotencyKey: input.idempotencyKey,
      amount,
      currency: price.currency,
      metadata: { provider, paymentId: payment._id.toString(), targetPlanId: plan._id.toString(), isTest: checkout.isTest },
    });
    return { checkout, payment, plan: publicPlan(plan), amount, currency: price.currency };
  } catch (error) {
    payment.status = "FAILED";
    await payment.save();
    throw error;
  }
}

function invoiceNumber() {
  const now = new Date();
  return `LN-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function createInvoiceForPayment(payment: AnyDocument, subscription: AnyDocument, plan: AnyDocument) {
  const business = await Business.findById(payment.businessId);
  if (!business) throw new Error("Invoice company is unavailable.");
  const isAddOn = payment.purpose === "ADD_ON";
  const baseAmount = isAddOn ? 0 : Number(payment.metadata?.subtotal ?? payment.amount ?? 0);
  const lineAmount = isAddOn ? Number(payment.amount ?? 0) : baseAmount;
  const discount = Number(payment.metadata?.discount ?? 0);
  const invoice = await Invoice.create({
    invoiceNumber: invoiceNumber(),
    businessId: business._id,
    subscriptionId: subscription._id,
    companyName: business.name,
    billingAddress: business.billingAddress ?? "",
    taxIdentificationNumber: business.taxIdentificationNumber,
    planName: plan.name,
    billingPeriodStart: subscription.currentPeriodStart,
    billingPeriodEnd: subscription.currentPeriodEnd,
    baseAmount,
    discount,
    overageCharges: 0,
    addOnCharges: isAddOn ? payment.amount : 0,
    tax: 0,
    total: payment.amount,
    currency: payment.currency,
    paymentStatus: "PAID",
    paymentDate: new Date(),
    paymentReference: payment.transactionReference,
    taxConfigurationReviewed: false,
    isTest: payment.isTest,
  });
  await InvoiceItem.create({
    invoiceId: invoice._id,
    businessId: business._id,
    type: isAddOn ? "ADD_ON" : "PLAN",
    description: isAddOn ? "Additional request pack" : `${plan.name} subscription`,
    quantity: 1,
    unitAmount: lineAmount,
    amount: lineAmount,
  });
  if (discount > 0) {
    await InvoiceItem.create({
      invoiceId: invoice._id,
      businessId: business._id,
      type: "DISCOUNT",
      description: "Promotional discount",
      quantity: 1,
      unitAmount: -discount,
      amount: -discount,
    });
  }
  payment.invoiceId = invoice._id;
  await payment.save();
  return invoice;
}

async function redeemPaymentCoupon(payment: AnyDocument, subscription: AnyDocument, invoice: AnyDocument) {
  if (!payment.couponId) return;
  const coupon = await Coupon.findById(payment.couponId);
  if (!coupon) return;
  await CouponRedemption.create({
    couponId: coupon._id,
    businessId: payment.businessId,
    subscriptionId: subscription._id,
    invoiceId: invoice._id,
    discountAmount: Number(payment.metadata?.discount ?? 0),
    requestCredits: Number(payment.metadata?.requestCredits ?? 0),
    trialDaysAdded: Number(payment.metadata?.trialDays ?? 0),
  });
  await Coupon.updateOne({ _id: coupon._id }, { $inc: { redemptionCount: 1 } });
}

export async function completePayment(payment: AnyDocument, providerReference?: string) {
  if (["COMPLETED", "VERIFIED"].includes(payment.status)) return payment;
  const subscription = await Subscription.findOne({ _id: payment.subscriptionId, businessId: payment.businessId });
  if (!subscription) throw new HttpError(409, "SUBSCRIPTION_NOT_FOUND", "Payment subscription is unavailable.");
  if (payment.purpose === "ADD_ON") {
    const pack = await AddOnPack.findById(payment.targetAddOnPackId);
    if (!pack) throw new HttpError(409, "ADD_ON_NOT_FOUND", "Request pack is unavailable.");
    const purchased = await PurchasedAddOn.create({
      businessId: payment.businessId,
      subscriptionId: subscription._id,
      addOnPackId: pack._id,
      requestsPurchased: pack.requests,
      requestsUsed: 0,
      price: payment.amount,
      currency: payment.currency,
      purchasedAt: new Date(),
      expiresAt: addDays(new Date(), pack.expiryDays),
      status: "ACTIVE",
      paymentId: payment._id,
      isTest: payment.isTest,
    });
    const plan = await Plan.findById(subscription.planId);
    if (!plan) throw new Error("Subscription plan unavailable.");
    const usage = await getOrCreateCurrentUsage(subscription, plan);
    usage.addOnRequests += pack.requests;
    await usage.save();
    payment.status = "COMPLETED";
    payment.providerPaymentId = providerReference ?? payment.providerPaymentId;
    await payment.save();
    const invoice = await createInvoiceForPayment(payment, subscription, plan);
    await notifyBusiness(
      payment.businessId.toString(),
      "ADD_ON_PURCHASED",
      "Additional request pack activated",
      `${pack.requests.toLocaleString()} additional requests are now available until ${purchased.expiresAt.toLocaleDateString()}.`,
      subscription._id.toString(),
      { isTest: payment.isTest },
    );
    return { payment, subscription, invoice, purchased };
  }

  const plan = await Plan.findById(payment.targetPlanId);
  if (!plan) throw new HttpError(409, "PLAN_NOT_FOUND", "The paid subscription plan is unavailable.");
  const now = new Date();
  const wasPaidUpgrade = payment.purpose === "UPGRADE" && subscription.status !== "TRIALING"
    && new Date(subscription.currentPeriodEnd).getTime() > now.getTime();
  const period = payment.targetBillingPeriod as "MONTHLY" | "ANNUAL";
  const previousPlanId = subscription.planId;
  subscription.planId = plan._id;
  subscription.billingPeriod = period;
  subscription.currency = payment.currency;
  subscription.basePrice = Number(payment.metadata?.fullPrice ?? payment.amount);
  subscription.discount = Number(payment.metadata?.discount ?? 0);
  subscription.tax = 0;
  subscription.finalPayableAmount = payment.amount;
  subscription.currentPeriodStart = wasPaidUpgrade ? subscription.currentPeriodStart : now;
  subscription.currentPeriodEnd = wasPaidUpgrade ? subscription.currentPeriodEnd : billingPeriodEnd(now, period);
  subscription.renewalDate = subscription.currentPeriodEnd;
  subscription.trialStart = undefined;
  subscription.trialEnd = undefined;
  subscription.status = "ACTIVE";
  subscription.provider = payment.provider;
  subscription.providerSubscriptionId = payment.providerSubscriptionId ?? subscription.providerSubscriptionId;
  subscription.paymentStatus = "PAID";
  subscription.couponId = payment.couponId;
  subscription.cancelAtPeriodEnd = false;
  subscription.cancellationDate = undefined;
  subscription.gracePeriodEnd = undefined;
  await subscription.save();

  const usage = await getOrCreateCurrentUsage(subscription, plan);
  usage.includedRequests = effectiveLimit(subscription, plan, "monthlyRequests");
  usage.manualAdjustment += Number(payment.metadata?.requestCredits ?? 0);
  await usage.save();
  payment.status = "COMPLETED";
  payment.providerPaymentId = providerReference ?? payment.providerPaymentId;
  await payment.save();
  const invoice = await createInvoiceForPayment(payment, subscription, plan);
  await redeemPaymentCoupon(payment, subscription, invoice);
  await SubscriptionChange.create({
    businessId: payment.businessId,
    subscriptionId: subscription._id,
    fromPlanId: previousPlanId,
    toPlanId: plan._id,
    type: payment.purpose === "UPGRADE" ? "UPGRADE" : "MANUAL",
    effectiveAt: now,
    status: "APPLIED",
    proratedAmount: payment.purpose === "UPGRADE" ? payment.amount : 0,
    currency: payment.currency,
  });
  await notifyBusiness(
    payment.businessId.toString(),
    payment.purpose === "UPGRADE" ? "SUBSCRIPTION_UPGRADED" : "PAYMENT_SUCCESSFUL",
    payment.purpose === "UPGRADE" ? `Upgraded to ${plan.name}` : "Payment successful",
    `${plan.name} is active through ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.${payment.isTest ? " This was a test transaction." : ""}`,
    subscription._id.toString(),
    { isTest: payment.isTest, invoiceId: invoice._id.toString() },
  );
  return { payment, subscription, invoice, usage };
}

export async function completeTestPayment(businessId: string, checkoutId: string) {
  const payment = await Payment.findOne({
    businessId,
    provider: "TEST",
    providerCheckoutId: checkoutId,
    status: "TEST_PENDING",
    isTest: true,
  });
  if (!payment) throw new HttpError(404, "TEST_PAYMENT_NOT_FOUND", "Pending test checkout not found.");
  return completePayment(payment, `test_payment_${randomBytes(8).toString("hex")}`);
}

export async function completeProviderPayment(provider: "STRIPE" | "RAZORPAY", checkoutId: string, providerPaymentId: string) {
  const payment = await Payment.findOne({
    provider,
    $or: [{ providerCheckoutId: checkoutId }, { providerSubscriptionId: checkoutId }],
    status: { $in: ["PENDING", "FAILED"] },
  });
  if (!payment) return null;
  return completePayment(payment, providerPaymentId);
}

export async function renewProviderSubscription(input: {
  provider: "STRIPE" | "RAZORPAY";
  providerSubscriptionId: string;
  providerPaymentId: string;
  amount?: number;
  currency?: string;
}) {
  if (await Payment.exists({ provider: input.provider, providerPaymentId: input.providerPaymentId })) return null;
  const subscription = await Subscription.findOne({
    provider: input.provider,
    providerSubscriptionId: input.providerSubscriptionId,
  });
  if (!subscription) return null;
  const now = new Date();
  if (new Date(subscription.currentPeriodEnd).getTime() > addDays(now, 2).getTime()) return null;
  if (subscription.pendingPlanId && subscription.pendingPlanEffectiveAt && new Date(subscription.pendingPlanEffectiveAt) <= now) {
    subscription.planId = subscription.pendingPlanId;
    subscription.pendingPlanId = undefined;
    subscription.pendingPlanEffectiveAt = undefined;
    await SubscriptionChange.updateOne(
      { subscriptionId: subscription._id, type: "DOWNGRADE", status: "PENDING" },
      { $set: { status: "APPLIED" } },
    );
  }
  const plan = await Plan.findById(subscription.planId);
  const owner = await User.findOne({ businessId: subscription.businessId, role: "CUSTOMER", companyRole: "COMPANY_ADMIN" });
  if (!plan || !owner) throw new Error("Renewal plan or company administrator is unavailable.");
  const start = new Date(Math.max(now.getTime(), new Date(subscription.currentPeriodEnd).getTime()));
  const end = billingPeriodEnd(start, subscription.billingPeriod as "MONTHLY" | "ANNUAL");
  subscription.currentPeriodStart = start;
  subscription.currentPeriodEnd = end;
  subscription.renewalDate = end;
  subscription.status = "ACTIVE";
  subscription.paymentStatus = "PAID";
  subscription.gracePeriodEnd = undefined;
  await subscription.save();
  const amount = input.amount ?? subscription.finalPayableAmount;
  const payment = await Payment.create({
    customerId: owner._id,
    businessId: subscription.businessId,
    subscriptionId: subscription._id,
    purpose: "SUBSCRIPTION",
    targetPlanId: plan._id,
    targetBillingPeriod: subscription.billingPeriod,
    method: "CARD",
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    providerSubscriptionId: input.providerSubscriptionId,
    transactionReference: input.providerPaymentId,
    amount,
    currency: input.currency?.toUpperCase() ?? subscription.currency,
    isTest: input.providerPaymentId.includes("test"),
    status: "COMPLETED",
    metadata: { fullPrice: amount, subtotal: amount, renewal: true },
  });
  const invoice = await createInvoiceForPayment(payment, subscription, plan);
  await getOrCreateCurrentUsage(subscription, plan, now);
  await SubscriptionChange.create({
    businessId: subscription.businessId,
    subscriptionId: subscription._id,
    fromPlanId: plan._id,
    toPlanId: plan._id,
    type: "RENEWAL",
    effectiveAt: start,
    status: "APPLIED",
    currency: subscription.currency,
  });
  await notifyBusiness(
    subscription.businessId.toString(),
    "SUBSCRIPTION_RENEWED",
    `${plan.name} renewed`,
    `Your subscription renewed through ${end.toLocaleDateString()}.`,
    subscription._id.toString(),
    { invoiceId: invoice._id.toString() },
  );
  return { subscription, payment, invoice };
}

export async function markPaymentFailed(provider: "STRIPE" | "RAZORPAY", reference: string) {
  const payment = await Payment.findOneAndUpdate(
    { provider, $or: [{ providerCheckoutId: reference }, { providerSubscriptionId: reference }] },
    { $set: { status: "FAILED" } },
    { new: true },
  );
  if (!payment?.subscriptionId) return null;
  const gracePeriodEnd = addDays(new Date(), numberFromEnv("BILLING_GRACE_PERIOD_DAYS", 7));
  const subscription = await Subscription.findByIdAndUpdate(
    payment.subscriptionId,
    { $set: { status: "PAYMENT_FAILED", paymentStatus: "FAILED", gracePeriodEnd } },
    { new: true },
  );
  if (subscription) {
    await notifyBusiness(
      subscription.businessId.toString(),
      "PAYMENT_FAILED",
      "Subscription payment failed",
      `Update your payment method before ${gracePeriodEnd.toLocaleDateString()} to avoid request restrictions.`,
      subscription._id.toString(),
    );
  }
  return { payment, subscription };
}

export async function recordProviderRefund(input: {
  provider: "STRIPE" | "RAZORPAY";
  providerPaymentId: string;
  providerRefundId: string;
  amount?: number;
  currency?: string;
  reason?: string;
  succeeded?: boolean;
}) {
  const payment = await Payment.findOne({
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
  });
  if (!payment) return null;
  const status = input.succeeded === false ? "PENDING" : "SUCCEEDED";
  const refund = await Refund.findOneAndUpdate(
    { providerRefundId: input.providerRefundId },
    {
      $setOnInsert: {
        businessId: payment.businessId,
        subscriptionId: payment.subscriptionId,
        paymentId: payment._id,
        invoiceId: payment.invoiceId,
        amount: input.amount ?? payment.amount,
        currency: (input.currency ?? payment.currency).toUpperCase(),
        providerRefundId: input.providerRefundId,
        reason: input.reason,
        isTest: payment.isTest,
      },
      $set: { status },
    },
    { new: true, upsert: true, runValidators: true },
  );
  if (status === "SUCCEEDED") {
    payment.status = "REFUNDED";
    await payment.save();
    if (payment.invoiceId) {
      await Invoice.updateOne({ _id: payment.invoiceId }, { $set: { paymentStatus: "REFUNDED" } });
    }
  }
  await notifyBusiness(
    payment.businessId.toString(),
    status === "SUCCEEDED" ? "REFUND_SUCCEEDED" : "REFUND_PENDING",
    status === "SUCCEEDED" ? "Refund completed" : "Refund is processing",
    `${refund.amount.toLocaleString()} ${refund.currency} ${status === "SUCCEEDED" ? "was refunded" : "is being refunded"}.`,
    payment.subscriptionId?.toString(),
    {
      provider: input.provider,
      providerRefundId: input.providerRefundId,
      paymentId: payment._id.toString(),
      amount: refund.amount,
      currency: refund.currency,
      isTest: payment.isTest,
    },
  );
  return refund;
}

export async function scheduleDowngrade(input: {
  businessId: string;
  planId: string;
  actorId: string;
}) {
  const { subscription, plan: currentPlan } = await subscriptionWithPlan(input.businessId);
  const nextPlan = await Plan.findOne({ _id: input.planId, active: true });
  if (!nextPlan || nextPlan.enterprise || nextPlan.sortOrder >= currentPlan.sortOrder) {
    throw new HttpError(422, "INVALID_DOWNGRADE", "Choose a lower active self-service plan.");
  }
  const [admins, dispatchUsers, branches] = await Promise.all([
    User.countDocuments({ businessId: input.businessId, role: "CUSTOMER", companyRole: "COMPANY_ADMIN" }),
    User.countDocuments({ businessId: input.businessId, role: "CUSTOMER", companyRole: "DISPATCH" }),
    Branch.countDocuments({ businessId: input.businessId, active: true }),
  ]);
  const blockers = downgradeCapacityBlockers({
    current: { companyAdmins: admins, dispatchUsers, branches },
    next: {
      companyAdmins: nextPlan.limits.companyAdmins,
      dispatchUsers: nextPlan.limits.dispatchUsers,
      branches: nextPlan.limits.branches,
    },
  });
  if (blockers.length) {
    throw new HttpError(409, "DOWNGRADE_LIMITS_EXCEEDED", `Reduce ${blockers.join(", ")} before scheduling this downgrade.`);
  }
  subscription.pendingPlanId = nextPlan._id;
  subscription.pendingPlanEffectiveAt = subscription.currentPeriodEnd;
  await subscription.save();
  const change = await SubscriptionChange.create({
    businessId: input.businessId,
    subscriptionId: subscription._id,
    fromPlanId: currentPlan._id,
    toPlanId: nextPlan._id,
    type: "DOWNGRADE",
    effectiveAt: subscription.currentPeriodEnd,
    status: "PENDING",
    actorId: input.actorId,
  });
  await notifyBusiness(
    input.businessId,
    "DOWNGRADE_SCHEDULED",
    `Downgrade to ${nextPlan.name} scheduled`,
    `The plan change will take effect on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`,
    subscription._id.toString(),
  );
  return { subscription, change, nextPlan: publicPlan(nextPlan) };
}

export async function cancelSubscription(input: {
  businessId: string;
  actorId: string;
  timing: "IMMEDIATE" | "PERIOD_END";
  reason?: string;
}) {
  const { subscription } = await subscriptionWithPlan(input.businessId);
  const now = new Date();
  subscription.cancellationDate = now;
  subscription.cancellationReason = input.reason;
  subscription.cancelAtPeriodEnd = input.timing === "PERIOD_END";
  subscription.status = input.timing === "IMMEDIATE" ? "CANCELLED" : subscription.status;
  if (input.timing === "IMMEDIATE") subscription.currentPeriodEnd = now;
  subscription.renewalDate = undefined;
  await subscription.save();
  await SubscriptionChange.create({
    businessId: input.businessId,
    subscriptionId: subscription._id,
    fromPlanId: subscription.planId,
    type: "CANCELLATION",
    effectiveAt: input.timing === "IMMEDIATE" ? now : subscription.currentPeriodEnd,
    status: input.timing === "IMMEDIATE" ? "APPLIED" : "PENDING",
    actorId: input.actorId,
    reason: input.reason,
  });
  await notifyBusiness(
    input.businessId,
    "SUBSCRIPTION_CANCELLED",
    input.timing === "IMMEDIATE" ? "Subscription cancelled" : "Subscription cancellation scheduled",
    input.timing === "IMMEDIATE"
      ? "New location requests are now restricted."
      : `Access continues through ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`,
    subscription._id.toString(),
  );
  return subscription;
}

export async function reactivateSubscription(businessId: string, actorId: string) {
  const subscription = await Subscription.findOne({ businessId, cancelAtPeriodEnd: true, currentPeriodEnd: { $gt: new Date() } });
  if (!subscription) throw new HttpError(409, "REACTIVATION_UNAVAILABLE", "This subscription cannot be reactivated.");
  subscription.cancelAtPeriodEnd = false;
  subscription.cancellationDate = undefined;
  subscription.cancellationReason = undefined;
  subscription.renewalDate = subscription.currentPeriodEnd;
  await subscription.save();
  await SubscriptionChange.create({
    businessId,
    subscriptionId: subscription._id,
    fromPlanId: subscription.planId,
    toPlanId: subscription.planId,
    type: "REACTIVATION",
    effectiveAt: new Date(),
    status: "APPLIED",
    actorId,
  });
  return subscription;
}

export async function createAddOnCheckout(input: {
  businessId: string;
  customerId: string;
  customerEmail: string;
  packId: string;
  idempotencyKey: string;
  appUrl: string;
}) {
  const business = await billingBusiness(input.businessId);
  const { subscription, plan } = await subscriptionWithPlan(input.businessId);
  if (!subscriptionHasAccess(subscription)) throw new HttpError(409, "SUBSCRIPTION_INACTIVE", "Activate a subscription before purchasing a request pack.");
  const pack = await AddOnPack.findOne({ _id: input.packId, active: true, currency: subscription.currency });
  if (!pack) throw new HttpError(404, "ADD_ON_NOT_FOUND", "Eligible request pack not found.");
  if (pack.eligiblePlanIds.length && !pack.eligiblePlanIds.some((id: AnyDocument) => id.toString() === plan._id.toString())) {
    throw new HttpError(409, "ADD_ON_PLAN_INELIGIBLE", "This request pack is not available for the current plan.");
  }
  const provider = defaultProviderForRegion(business.billingRegion) as PaymentProviderName;
  const payment = await Payment.create({
    customerId: input.customerId,
    businessId: business._id,
    subscriptionId: subscription._id,
    purpose: "ADD_ON",
    targetAddOnPackId: pack._id,
    method: provider === "TEST" ? "TEST" : "CARD",
    provider,
    transactionReference: `PENDING-${randomBytes(8).toString("hex").toUpperCase()}`,
    amount: pack.price,
    currency: pack.currency,
    isTest: provider === "TEST",
    status: provider === "TEST" ? "TEST_PENDING" : "PENDING",
    metadata: { requests: pack.requests, packName: pack.name },
  });
  try {
    const checkout = await gatewayFor(provider).createCheckout({
      provider,
      businessId: input.businessId,
      subscriptionId: subscription._id.toString(),
      customerEmail: input.customerEmail,
      currency: pack.currency,
      amount: pack.price,
      billingPeriod: "MONTHLY",
      description: pack.name,
      successUrl: `${input.appUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${input.appUrl}/dashboard/billing?checkout=cancelled`,
      idempotencyKey: input.idempotencyKey,
    });
    payment.providerCheckoutId = checkout.checkoutId;
    payment.transactionReference = checkout.checkoutId;
    payment.isTest = checkout.isTest;
    await payment.save();
    return { checkout, payment, pack };
  } catch (error) {
    payment.status = "FAILED";
    await payment.save();
    throw error;
  }
}

export async function manuallyActivateSubscription(input: {
  businessId: string;
  planId: string;
  actorId: string;
  currency: string;
  customPrice: number;
  startDate: Date;
  expiryDate: Date;
  requestLimit?: number;
  companyAdminLimit?: number;
  dispatchUserLimit?: number;
  branchLimit?: number;
  enabledFeatures?: string[];
  paymentStatus: string;
  internalNotes?: string;
}) {
  const business = await billingBusiness(input.businessId);
  const plan = await Plan.findById(input.planId);
  if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Plan not found.");
  const subscription = await Subscription.findOneAndUpdate(
    { businessId: business._id },
    {
      $set: {
        planId: plan._id,
        billingPeriod: "MANUAL",
        currency: input.currency,
        basePrice: input.customPrice,
        discount: 0,
        tax: 0,
        finalPayableAmount: input.customPrice,
        currentPeriodStart: input.startDate,
        currentPeriodEnd: input.expiryDate,
        renewalDate: input.expiryDate,
        status: "MANUALLY_ACTIVATED",
        provider: "MANUAL",
        assignedRegion: business.billingRegion,
        paymentStatus: input.paymentStatus,
        cancelAtPeriodEnd: false,
        manualOverrides: {
          requestLimit: input.requestLimit,
          companyAdminLimit: input.companyAdminLimit,
          dispatchUserLimit: input.dispatchUserLimit,
          branchLimit: input.branchLimit,
          enabledFeatures: input.enabledFeatures ?? [],
          expiryDate: input.expiryDate,
          internalNotes: input.internalNotes,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await SubscriptionUsage.findOneAndUpdate(
    { subscriptionId: subscription._id, billingCycleStart: input.startDate },
    {
      $set: {
        businessId: business._id,
        subscriptionId: subscription._id,
        billingCycleStart: input.startDate,
        billingCycleEnd: input.expiryDate,
        includedRequests: input.requestLimit ?? plan.limits.monthlyRequests,
      },
      $setOnInsert: { requestsUsed: 0 },
    },
    { upsert: true },
  );
  await SubscriptionChange.create({
    businessId: business._id,
    subscriptionId: subscription._id,
    toPlanId: plan._id,
    type: "MANUAL",
    effectiveAt: input.startDate,
    status: "APPLIED",
    actorId: input.actorId,
    reason: input.internalNotes,
  });
  await notifyBusiness(
    input.businessId,
    "SUBSCRIPTION_MANUALLY_ACTIVATED",
    `${plan.name} activated`,
    `B Socio activated your subscription through ${input.expiryDate.toLocaleDateString()}.`,
    subscription._id.toString(),
  );
  return subscription;
}

export async function recordManualPayment(input: {
  businessId: string;
  subscriptionId?: string;
  method: string;
  paymentReference: string;
  proofReference?: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  internalNotes?: string;
  actorId: string;
}) {
  const payment = await ManualPayment.create({
    ...input,
    reviewedBy: input.actorId,
    reviewedAt: input.status === "PENDING" ? undefined : new Date(),
  });
  if (input.status === "APPROVED" && input.subscriptionId) {
    await Subscription.updateOne(
      { _id: input.subscriptionId, businessId: input.businessId },
      { $set: { paymentStatus: "PAID", status: "MANUALLY_ACTIVATED", provider: "OFFLINE" } },
    );
  }
  await BillingEvent.create({
    businessId: input.businessId,
    subscriptionId: input.subscriptionId,
    type: `MANUAL_PAYMENT_${input.status}`,
    amount: input.amount,
    currency: input.currency,
    metadata: { paymentId: payment._id.toString(), actorId: input.actorId },
  });
  return payment;
}

export async function adjustUsage(input: {
  businessId: string;
  adjustment: number;
  reason: string;
  actorId: string;
}) {
  const { subscription, plan } = await subscriptionWithPlan(input.businessId);
  const usage = await getOrCreateCurrentUsage(subscription, plan);
  const next = usage.manualAdjustment + input.adjustment;
  if (usage.includedRequests + usage.addOnRequests + next < 0) {
    throw new HttpError(422, "INVALID_USAGE_ADJUSTMENT", "The adjustment would create a negative request entitlement.");
  }
  usage.manualAdjustment = next;
  await usage.save();
  await BillingEvent.create({
    businessId: input.businessId,
    subscriptionId: subscription._id,
    type: "USAGE_MANUALLY_ADJUSTED",
    metadata: { adjustment: input.adjustment, reason: input.reason, actorId: input.actorId },
  });
  return usage;
}

export async function getBillingSummary(businessId: string) {
  await ensureBillingCatalog();
  const business = await billingBusiness(businessId);
  const { subscription, plan } = await subscriptionWithPlan(businessId);
  const usage = await getOrCreateCurrentUsage(subscription, plan);
  const [plans, prices, invoices, invoiceItems, payments, addOnPacks, purchasedAddOns, changes] = await Promise.all([
    Plan.find({ active: true }).sort({ sortOrder: 1 }).lean(),
    PlanPrice.find({ region: business.billingRegion, active: true }).lean(),
    Invoice.find({ businessId }).sort({ createdAt: -1 }).limit(50).lean(),
    InvoiceItem.find({ businessId }).sort({ createdAt: 1 }).lean(),
    Payment.find({ businessId, purpose: { $in: ["SUBSCRIPTION", "UPGRADE", "ADD_ON"] } })
      .select("-customerNotes -adminNotes -metadata")
      .sort({ createdAt: -1 }).limit(25).lean(),
    AddOnPack.find({ active: true, currency: subscription.currency }).sort({ requests: 1 }).lean(),
    PurchasedAddOn.find({ businessId }).sort({ purchasedAt: -1 }).limit(25).lean(),
    SubscriptionChange.find({ businessId }).sort({ createdAt: -1 }).limit(25).lean(),
  ]);
  const itemsByInvoice = new Map<string, AnyDocument[]>();
  for (const item of invoiceItems) {
    const key = item.invoiceId.toString();
    itemsByInvoice.set(key, [...(itemsByInvoice.get(key) ?? []), item]);
  }
  const priceByPlan = new Map(prices.map((price) => [price.planId.toString(), price]));
  const limits = {
    monthlyRequests: effectiveLimit(subscription, plan, "monthlyRequests"),
    companyAdmins: effectiveLimit(subscription, plan, "companyAdmins"),
    dispatchUsers: effectiveLimit(subscription, plan, "dispatchUsers"),
    branches: effectiveLimit(subscription, plan, "branches"),
    retentionDays: plan.limits.retentionDays,
  };
  return {
    company: {
      id: business._id.toString(),
      name: business.name,
      country: business.country,
      billingRegion: business.billingRegion,
      billingAddress: business.billingAddress,
      taxIdentificationNumber: business.taxIdentificationNumber,
    },
    subscription: subscription.toObject(),
    plan: publicPlan(plan),
    limits,
    usage: {
      ...usage.toObject(),
      remaining: getRemainingRequestsFromUsage(usage),
      percentage: usagePercentage(usage),
      warningThreshold: usageWarningThreshold(usagePercentage(usage)),
    },
    plans: (plans as unknown as AnyDocument[]).map((item) => ({ ...publicPlan(item), price: priceByPlan.get(String(item._id)) })),
    invoices: (invoices as unknown as AnyDocument[]).map((invoice) => ({ ...invoice, items: itemsByInvoice.get(String(invoice._id)) ?? [] })),
    payments,
    addOnPacks,
    purchasedAddOns,
    changes,
    testMode: process.env.BILLING_TEST_MODE !== "false",
    taxNotice: "Tax-ready records are provided, but tax compliance is not claimed until local configuration is reviewed.",
  };
}

export async function getInvoiceForBusiness(invoiceId: string, businessId: string, admin = false) {
  const invoice = await Invoice.findOne(admin ? { _id: invoiceId } : { _id: invoiceId, businessId }).lean() as unknown as AnyDocument | null;
  if (!invoice) throw new HttpError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
  const items = await InvoiceItem.find({ invoiceId: invoice._id, businessId: invoice.businessId }).sort({ createdAt: 1 }).lean();
  return { ...invoice, items };
}

export async function getAdminBillingMetrics(filters: {
  planId?: string;
  country?: string;
  currency?: string;
  status?: string;
  from?: Date;
  to?: Date;
}) {
  await ensureBillingCatalog();
  const subscriptionFilter: AnyDocument = {};
  if (filters.planId) subscriptionFilter.planId = filters.planId;
  if (filters.currency) subscriptionFilter.currency = filters.currency;
  if (filters.status) subscriptionFilter.status = filters.status;
  if (filters.from || filters.to) {
    subscriptionFilter.createdAt = {};
    if (filters.from) subscriptionFilter.createdAt.$gte = filters.from;
    if (filters.to) subscriptionFilter.createdAt.$lte = filters.to;
  }
  if (filters.country) {
    const businesses = await Business.find({ country: filters.country }).select("_id").lean();
    subscriptionFilter.businessId = { $in: businesses.map((business) => business._id) };
  }
  const subscriptions = await Subscription.find(subscriptionFilter).lean();
  const businessIds = subscriptions.map((subscription) => subscription.businessId);
  const [plans, businesses, usages, payments, upcomingRenewals, expiringTrials] = await Promise.all([
    Plan.find({}).lean(),
    Business.find({ _id: { $in: businessIds } }).select("name country billingRegion").lean(),
    SubscriptionUsage.find({ businessId: { $in: businessIds } }).lean(),
    Payment.find({ businessId: { $in: businessIds }, status: { $in: ["COMPLETED", "VERIFIED"] } }).lean(),
    Subscription.countDocuments({ ...subscriptionFilter, renewalDate: { $gte: new Date(), $lte: addDays(new Date(), 30) } }),
    Subscription.countDocuments({ ...subscriptionFilter, status: "TRIALING", trialEnd: { $gte: new Date(), $lte: addDays(new Date(), 3) } }),
  ]);
  const typedPlans = plans as unknown as AnyDocument[];
  const typedBusinesses = businesses as unknown as AnyDocument[];
  const typedSubscriptions = subscriptions as unknown as AnyDocument[];
  const typedPayments = payments as unknown as AnyDocument[];
  const typedUsages = usages as unknown as AnyDocument[];
  const planById = new Map(typedPlans.map((plan) => [String(plan._id), plan]));
  const businessById = new Map(typedBusinesses.map((business) => [String(business._id), business]));
  const activeStatuses = ["ACTIVE", "MANUALLY_ACTIVATED"];
  const active = typedSubscriptions.filter((subscription) => activeStatuses.includes(subscription.status));
  const mrr = active.reduce((sum, subscription) => sum + (
    subscription.billingPeriod === "ANNUAL" ? subscription.finalPayableAmount / 12 : subscription.finalPayableAmount
  ), 0);
  const trialCount = typedSubscriptions.filter((subscription) => subscription.status === "TRIALING").length;
  const cancelled = typedSubscriptions.filter((subscription) => ["CANCELLED", "EXPIRED"].includes(subscription.status)).length;
  const paidBusinessIds = new Set(typedPayments.map((payment) => payment.businessId.toString()));
  const convertedTrials = typedSubscriptions.filter((subscription) => paidBusinessIds.has(subscription.businessId.toString())).length;
  const revenueByPlan = new Map<string, number>();
  const revenueByCountry = new Map<string, number>();
  const revenueByCurrency = new Map<string, number>();
  for (const payment of typedPayments) {
    const subscription = typedSubscriptions.find((item) => item._id.toString() === payment.subscriptionId?.toString());
    const planName = subscription ? planById.get(subscription.planId.toString())?.name ?? "Unknown" : "Legacy";
    const business = businessById.get(payment.businessId.toString());
    revenueByPlan.set(planName, (revenueByPlan.get(planName) ?? 0) + Number(payment.amount ?? 0));
    revenueByCountry.set(business?.country ?? "Unknown", (revenueByCountry.get(business?.country ?? "Unknown") ?? 0) + Number(payment.amount ?? 0));
    revenueByCurrency.set(payment.currency ?? "Unknown", (revenueByCurrency.get(payment.currency ?? "Unknown") ?? 0) + Number(payment.amount ?? 0));
  }
  return {
    metrics: {
      monthlyRecurringRevenue: mrr,
      annualRecurringRevenue: mrr * 12,
      activeSubscriptions: active.length,
      trialCompanies: trialCount,
      trialToPaidConversion: trialCount + convertedTrials ? convertedTrials / (trialCount + convertedTrials) : 0,
      cancelledSubscriptions: cancelled,
      failedPayments: typedSubscriptions.filter((subscription) => ["PAYMENT_FAILED", "PAST_DUE", "GRACE_PERIOD"].includes(subscription.status)).length,
      requestsConsumed: typedUsages.reduce((sum, usage) => sum + usage.requestsUsed, 0),
      overageRevenue: typedPayments.filter((payment) => payment.purpose === "OVERAGE").reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
      addOnRevenue: typedPayments.filter((payment) => payment.purpose === "ADD_ON").reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
      upcomingRenewals,
      expiringTrials,
      pastDueAccounts: typedSubscriptions.filter((subscription) => ["PAYMENT_FAILED", "PAST_DUE", "GRACE_PERIOD"].includes(subscription.status)).length,
      churnRate: active.length + cancelled ? cancelled / (active.length + cancelled) : 0,
    },
    revenueByPlan: [...revenueByPlan].map(([label, amount]) => ({ label, amount })),
    revenueByCountry: [...revenueByCountry].map(([label, amount]) => ({ label, amount })),
    revenueByCurrency: [...revenueByCurrency].map(([label, amount]) => ({ label, amount })),
    subscriptions: typedSubscriptions.map((subscription) => ({
      ...subscription,
      planName: planById.get(subscription.planId.toString())?.name ?? "Unknown",
      companyName: businessById.get(subscription.businessId.toString())?.name ?? "Unknown",
      country: businessById.get(subscription.businessId.toString())?.country ?? "Unknown",
    })),
    plans: typedPlans.map(publicPlan),
  };
}

export async function applyScheduledChanges(now = new Date()) {
  const subscriptions = await Subscription.find({ pendingPlanId: { $exists: true }, pendingPlanEffectiveAt: { $lte: now } });
  let applied = 0;
  for (const subscription of subscriptions) {
    const plan = await Plan.findById(subscription.pendingPlanId);
    if (!plan) continue;
    subscription.planId = plan._id;
    subscription.pendingPlanId = undefined;
    subscription.pendingPlanEffectiveAt = undefined;
    await subscription.save();
    await SubscriptionChange.updateOne(
      { subscriptionId: subscription._id, type: "DOWNGRADE", status: "PENDING" },
      { $set: { status: "APPLIED" } },
    );
    applied += 1;
  }
  return applied;
}

export async function runBillingMaintenance(now = new Date()) {
  const appliedDowngrades = await applyScheduledChanges(now);
  const [expiringTrials, endingGracePeriods, lifecycleCandidates] = await Promise.all([
    Subscription.find({ status: "TRIALING", trialEnd: { $gt: now, $lte: addDays(now, 3) } }),
    Subscription.find({ status: { $in: ["PAST_DUE", "PAYMENT_FAILED", "GRACE_PERIOD"] }, gracePeriodEnd: { $gt: now, $lte: addDays(now, 1) } }),
    Subscription.find({
      $or: [
        { status: "TRIALING", trialEnd: { $lte: now } },
        { status: { $in: ["PAST_DUE", "PAYMENT_FAILED", "GRACE_PERIOD"] }, gracePeriodEnd: { $lte: now } },
        { status: "CANCELLED", currentPeriodEnd: { $lte: now } },
      ],
    }),
  ]);
  let reminders = 0;
  for (const subscription of expiringTrials) {
    if (!await BillingEvent.exists({ subscriptionId: subscription._id, type: "TRIAL_ENDING_3_DAYS" })) {
      await notifyBusiness(
        subscription.businessId.toString(),
        "TRIAL_ENDING_3_DAYS",
        "Your trial ends in three days",
        "Upgrade now to avoid an interruption in new location-request creation.",
        subscription._id.toString(),
      );
      reminders += 1;
    }
  }
  for (const subscription of endingGracePeriods) {
    if (!await BillingEvent.exists({ subscriptionId: subscription._id, type: "GRACE_PERIOD_ENDING" })) {
      await notifyBusiness(
        subscription.businessId.toString(),
        "GRACE_PERIOD_ENDING",
        "Your billing grace period is ending",
        `Resolve payment before ${new Date(subscription.gracePeriodEnd).toLocaleDateString()} to avoid request restrictions.`,
        subscription._id.toString(),
      );
      reminders += 1;
    }
  }
  for (const subscription of lifecycleCandidates) await synchronizeSubscriptionState(subscription, now);
  const expiredAddOns = await PurchasedAddOn.updateMany(
    { status: "ACTIVE", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED" } },
  );
  return { appliedDowngrades, reminders, expiredAddOns: expiredAddOns.modifiedCount };
}
