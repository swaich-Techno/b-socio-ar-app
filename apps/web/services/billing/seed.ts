import { addDays, addMonths, addYears, countryToBillingRegion } from "./domain";
import {
  AddOnPack,
  Business,
  Coupon,
  Payment,
  Plan,
  PlanPrice,
  Subscription,
  SubscriptionUsage,
  User,
} from "@/models";

const ALL_LANGUAGES = ["en", "es", "hi", "pa", "fr", "ar"];

export const DEFAULT_PLANS = [
  {
    code: "FREE_TRIAL",
    name: "Free Trial",
    description: "A 14-day evaluation with 25 secure request links and no card required.",
    active: true,
    enterprise: false,
    trialDays: 14,
    limits: { monthlyRequests: 25, companyAdmins: 1, dispatchUsers: 1, branches: 1, retentionDays: 7 },
    languages: ["en", "es"],
    featureFlags: {
      basic_dashboard: true, google_maps_links: true, email_notifications: false, custom_branding: false,
      webhooks: false, csv_export: false, api_access: false, multiple_branches: false,
    },
    overage: { enabled: false, behavior: "HARD_LIMIT", rates: {}, requiresApproval: true },
    sortOrder: 0,
  },
  {
    code: "STARTER",
    name: "Starter",
    description: "Core location-request workflow for one branch and a small dispatch team.",
    active: true,
    enterprise: false,
    trialDays: 0,
    limits: { monthlyRequests: 150, companyAdmins: 1, dispatchUsers: 2, branches: 1, retentionDays: 7 },
    languages: ["en", "es"],
    featureFlags: {
      basic_dashboard: true, google_maps_links: true, custom_branding: true, request_history: true,
      email_notifications: true, webhooks: false, csv_export: false, api_access: false,
      multiple_branches: false, priority_support: false,
    },
    overage: { enabled: false, behavior: "HARD_LIMIT", rates: { INR: 8, USD: 0.15 }, requiresApproval: true },
    sortOrder: 10,
  },
  {
    code: "BUSINESS",
    name: "Business",
    description: "Multi-branch operations, integrations, exports, notifications, and response analytics.",
    active: true,
    enterprise: false,
    trialDays: 0,
    limits: { monthlyRequests: 1500, companyAdmins: 1, dispatchUsers: 15, branches: 5, retentionDays: 30 },
    languages: ALL_LANGUAGES,
    featureFlags: {
      basic_dashboard: true, google_maps_links: true, custom_branding: true, request_history: true,
      email_notifications: true, telegram_notifications: true, webhooks: true, csv_export: true,
      multiple_branches: true, advanced_analytics: true, custom_templates: true, branch_reporting: true,
      priority_support: true, custom_retention: true, api_access: false,
    },
    overage: { enabled: true, behavior: "HARD_LIMIT", rates: { INR: 5, USD: 0.1 }, requiresApproval: true },
    sortOrder: 20,
  },
  {
    code: "PROFESSIONAL",
    name: "Professional",
    description: "Advanced automation, analytics, permissions, integrations, and flexible branding at scale.",
    active: true,
    enterprise: false,
    trialDays: 0,
    limits: { monthlyRequests: 7500, companyAdmins: 3, dispatchUsers: 50, branches: 20, retentionDays: 365 },
    languages: ALL_LANGUAGES,
    featureFlags: {
      basic_dashboard: true, google_maps_links: true, custom_branding: true, request_history: true,
      email_notifications: true, telegram_notifications: true, webhooks: true, csv_export: true,
      multiple_branches: true, advanced_analytics: true, custom_templates: true, branch_reporting: true,
      priority_support: true, custom_retention: true, api_access: true, sms_integration: true,
      whatsapp_integration: true, advanced_exports: true, role_permissions: true, activity_logs: true,
      custom_fields: true, white_label: false,
    },
    overage: { enabled: true, behavior: "SOFT_LIMIT", rates: { INR: 3, USD: 0.06 }, requiresApproval: true },
    sortOrder: 30,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Contract-defined volume, white label, custom integrations, security, hosting, and service levels.",
    active: true,
    enterprise: true,
    trialDays: 0,
    limits: { monthlyRequests: 0, companyAdmins: 1, dispatchUsers: 0, branches: 1, retentionDays: 365 },
    languages: ALL_LANGUAGES,
    featureFlags: {
      basic_dashboard: true, google_maps_links: true, custom_branding: true, request_history: true,
      email_notifications: true, telegram_notifications: true, webhooks: true, csv_export: true,
      multiple_branches: true, advanced_analytics: true, custom_templates: true, branch_reporting: true,
      priority_support: true, custom_retention: true, api_access: true, sms_integration: true,
      whatsapp_integration: true, advanced_exports: true, role_permissions: true, activity_logs: true,
      custom_fields: true, white_label: true, custom_domain: true, bulk_requests: true,
      crm_integration: true, erp_integration: true, sso_ready: true,
    },
    overage: { enabled: true, behavior: "SOFT_LIMIT", rates: {}, requiresApproval: true },
    sortOrder: 40,
  },
] as const;

const PRICE_MATRIX: Record<string, Record<string, { currency: string; monthly: number; annual: number }>> = {
  STARTER: {
    INDIA: { currency: "INR", monthly: 999, annual: 9999 },
    UNITED_STATES: { currency: "USD", monthly: 19, annual: 190 },
    CANADA: { currency: "CAD", monthly: 25, annual: 250 },
    UNITED_KINGDOM: { currency: "GBP", monthly: 15, annual: 150 },
    EUROPE: { currency: "EUR", monthly: 17, annual: 170 },
    MIDDLE_EAST: { currency: "AED", monthly: 69, annual: 690 },
    OTHER: { currency: "USD", monthly: 19, annual: 190 },
  },
  BUSINESS: {
    INDIA: { currency: "INR", monthly: 2999, annual: 29999 },
    UNITED_STATES: { currency: "USD", monthly: 59, annual: 590 },
    CANADA: { currency: "CAD", monthly: 79, annual: 790 },
    UNITED_KINGDOM: { currency: "GBP", monthly: 47, annual: 470 },
    EUROPE: { currency: "EUR", monthly: 54, annual: 540 },
    MIDDLE_EAST: { currency: "AED", monthly: 219, annual: 2190 },
    OTHER: { currency: "USD", monthly: 59, annual: 590 },
  },
  PROFESSIONAL: {
    INDIA: { currency: "INR", monthly: 7999, annual: 79999 },
    UNITED_STATES: { currency: "USD", monthly: 149, annual: 1490 },
    CANADA: { currency: "CAD", monthly: 199, annual: 1990 },
    UNITED_KINGDOM: { currency: "GBP", monthly: 119, annual: 1190 },
    EUROPE: { currency: "EUR", monthly: 139, annual: 1390 },
    MIDDLE_EAST: { currency: "AED", monthly: 549, annual: 5490 },
    OTHER: { currency: "USD", monthly: 149, annual: 1490 },
  },
};

export async function seedBillingDefaults(options: { includeSamples?: boolean } = {}) {
  for (const plan of DEFAULT_PLANS) {
    await Plan.updateOne({ code: plan.code }, { $setOnInsert: plan }, { upsert: true });
  }
  const plans = await Plan.find({ code: { $in: DEFAULT_PLANS.map((plan) => plan.code) } });
  const byCode = new Map(plans.map((plan) => [plan.code, plan]));

  for (const [code, regions] of Object.entries(PRICE_MATRIX)) {
    const plan = byCode.get(code);
    if (!plan) continue;
    for (const [region, price] of Object.entries(regions)) {
      await PlanPrice.updateOne(
        { planId: plan._id, region, currency: price.currency },
        { $setOnInsert: { planId: plan._id, region, currency: price.currency, monthlyAmount: price.monthly, annualAmount: price.annual, taxInclusive: false, active: true } },
        { upsert: true },
      );
    }
  }

  const starter = byCode.get("STARTER");
  const business = byCode.get("BUSINESS");
  const professional = byCode.get("PROFESSIONAL");
  const eligiblePlanIds = [starter, business, professional].filter(Boolean).map((plan) => plan!._id);
  const now = new Date();
  await Coupon.updateOne(
    { code: "WELCOME20" },
    {
      $setOnInsert: {
        code: "WELCOME20",
        description: "Twenty percent off the first paid billing cycle.",
        type: "PERCENTAGE",
        eligiblePlanIds,
        eligibleBillingPeriods: ["MONTHLY", "ANNUAL"],
        discountValue: 20,
        maximumRedemptions: 500,
        redemptionCount: 0,
        startDate: addDays(now, -1),
        expiryDate: addYears(now, 1),
        perCompanyUsageLimit: 1,
        newCustomersOnly: true,
        active: true,
      },
    },
    { upsert: true },
  );

  const packs = [
    { name: "100 request pack", requests: 100, price: 12, currency: "USD", expiryDays: 90 },
    { name: "500 request pack", requests: 500, price: 50, currency: "USD", expiryDays: 90 },
    { name: "1,000 request pack", requests: 1000, price: 90, currency: "USD", expiryDays: 120 },
    { name: "5,000 request pack", requests: 5000, price: 375, currency: "USD", expiryDays: 180 },
    { name: "100 request pack", requests: 100, price: 700, currency: "INR", expiryDays: 90 },
    { name: "500 request pack", requests: 500, price: 3000, currency: "INR", expiryDays: 90 },
    { name: "1,000 request pack", requests: 1000, price: 5500, currency: "INR", expiryDays: 120 },
    { name: "5,000 request pack", requests: 5000, price: 22500, currency: "INR", expiryDays: 180 },
  ];
  for (const pack of packs) {
    await AddOnPack.updateOne(
      { name: pack.name, currency: pack.currency },
      { $setOnInsert: { ...pack, eligiblePlanIds, active: true } },
      { upsert: true },
    );
  }

  if (options.includeSamples && process.env.NODE_ENV !== "production") {
    await seedSampleSubscriptions(byCode);
  }

  return {
    plans: await Plan.countDocuments(),
    prices: await PlanPrice.countDocuments(),
    coupons: await Coupon.countDocuments(),
    addOnPacks: await AddOnPack.countDocuments(),
  };
}

async function seedSampleSubscriptions(byCode: Map<string, InstanceType<typeof Plan>>) {
  const sampleUsers = await User.find({ role: "CUSTOMER", businessId: { $exists: true } }).sort({ createdAt: 1 }).limit(3);
  const statuses = ["TRIALING", "ACTIVE", "PAYMENT_FAILED"] as const;
  const codes = ["FREE_TRIAL", "BUSINESS", "STARTER"] as const;
  for (let index = 0; index < sampleUsers.length; index += 1) {
    const user = sampleUsers[index];
    const code = codes[index];
    if (!user || !code) continue;
    const business = await Business.findById(user.businessId);
    const plan = byCode.get(code);
    if (!business || !plan || await Subscription.exists({ businessId: business._id })) continue;
    const start = addDays(new Date(), -index * 3);
    const end = index === 0 ? addDays(start, 14) : addMonths(start, 1);
    const status = statuses[index];
    const subscription = await Subscription.create({
      businessId: business._id,
      planId: plan._id,
      billingPeriod: index === 0 ? "TRIAL" : "MONTHLY",
      currency: business.country.toLowerCase() === "india" ? "INR" : "USD",
      basePrice: index === 0 ? 0 : index === 1 ? 59 : 19,
      discount: 0,
      tax: 0,
      finalPayableAmount: index === 0 ? 0 : index === 1 ? 59 : 19,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      trialStart: index === 0 ? start : undefined,
      trialEnd: index === 0 ? end : undefined,
      renewalDate: end,
      gracePeriodEnd: index === 2 ? addDays(new Date(), 7) : undefined,
      status,
      provider: index === 2 ? "TEST" : index === 0 ? "MANUAL" : "TEST",
      assignedRegion: business.billingRegion ?? countryToBillingRegion(business.country),
      paymentStatus: status === "PAYMENT_FAILED" ? "FAILED" : "TEST",
    });
    await SubscriptionUsage.create({
      businessId: business._id,
      subscriptionId: subscription._id,
      billingCycleStart: start,
      billingCycleEnd: end,
      includedRequests: plan.limits.monthlyRequests,
      requestsUsed: index === 0 ? 7 : index === 1 ? 1200 : 80,
    });
    if (index === 2) {
      await Payment.create({
        customerId: user._id,
        businessId: business._id,
        subscriptionId: subscription._id,
        method: "TEST",
        provider: "TEST",
        transactionReference: `TEST-FAILED-${Date.now()}`,
        amount: 19,
        currency: subscription.currency,
        isTest: true,
        status: "FAILED",
      });
    }
  }
}
