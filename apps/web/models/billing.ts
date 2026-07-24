/* eslint-disable @typescript-eslint/no-explicit-any */
import { Schema, model, models, type Model } from "mongoose";

const objectId = Schema.Types.ObjectId;
const timestamps = { timestamps: true, versionKey: false } as const;
type LooseModel = Model<any>;
const registered = (name: string, schema: Schema, collection: string): LooseModel =>
  (models[name] as LooseModel | undefined) ?? model<any>(name, schema, collection);

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "PAYMENT_FAILED",
  "GRACE_PERIOD",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
  "MANUALLY_ACTIVATED",
] as const;

export const FEATURE_KEYS = [
  "custom_branding",
  "webhooks",
  "csv_export",
  "api_access",
  "multiple_branches",
  "advanced_analytics",
  "telegram_notifications",
  "email_notifications",
  "sms_integration",
  "whatsapp_integration",
  "white_label",
  "custom_domain",
  "priority_support",
  "custom_retention",
  "basic_dashboard",
  "google_maps_links",
  "request_history",
  "custom_templates",
  "branch_reporting",
  "advanced_exports",
  "role_permissions",
  "activity_logs",
  "custom_fields",
  "bulk_requests",
  "crm_integration",
  "erp_integration",
  "sso_ready",
] as const;

const planLimitsSchema = new Schema(
  {
    monthlyRequests: { type: Number, required: true, min: 0 },
    yearlyPooledRequests: { type: Number, min: 0 },
    companyAdmins: { type: Number, required: true, min: 1 },
    dispatchUsers: { type: Number, required: true, min: 0 },
    branches: { type: Number, required: true, min: 1 },
    retentionDays: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const overageSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    behavior: { type: String, enum: ["HARD_LIMIT", "SOFT_LIMIT"], default: "HARD_LIMIT" },
    rates: { type: Map, of: Number, default: {} },
    requiresApproval: { type: Boolean, default: true },
  },
  { _id: false },
);

const planSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 1000 },
    active: { type: Boolean, default: true, index: true },
    enterprise: { type: Boolean, default: false },
    trialDays: { type: Number, default: 0, min: 0, max: 365 },
    limits: { type: planLimitsSchema, required: true },
    languages: { type: [String], default: ["en", "es"] },
    featureFlags: { type: Map, of: Boolean, default: {} },
    overage: { type: overageSchema, required: true },
    sortOrder: { type: Number, required: true, default: 0 },
    internalNotes: { type: String, select: false, maxlength: 5000 },
  },
  timestamps,
);
planSchema.index({ code: 1 }, { unique: true });
planSchema.index({ active: 1, sortOrder: 1 });

const planPriceSchema = new Schema(
  {
    planId: { type: objectId, ref: "Plan", required: true, index: true },
    region: {
      type: String,
      enum: ["INDIA", "UNITED_STATES", "CANADA", "UNITED_KINGDOM", "EUROPE", "MIDDLE_EAST", "OTHER"],
      required: true,
    },
    currency: { type: String, enum: ["INR", "USD", "CAD", "GBP", "EUR", "AED"], required: true },
    monthlyAmount: { type: Number, required: true, min: 0 },
    annualAmount: { type: Number, required: true, min: 0 },
    taxInclusive: { type: Boolean, default: false },
    stripePriceIds: { monthly: String, annual: String },
    razorpayPlanIds: { monthly: String, annual: String },
    active: { type: Boolean, default: true },
  },
  timestamps,
);
planPriceSchema.index({ planId: 1, region: 1, currency: 1 }, { unique: true });

const subscriptionSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, unique: true, index: true },
    planId: { type: objectId, ref: "Plan", required: true, index: true },
    billingPeriod: { type: String, enum: ["TRIAL", "MONTHLY", "ANNUAL", "MANUAL"], required: true },
    currency: { type: String, enum: ["INR", "USD", "CAD", "GBP", "EUR", "AED"], required: true },
    basePrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    finalPayableAmount: { type: Number, required: true, min: 0 },
    currentPeriodStart: { type: Date, required: true, index: true },
    currentPeriodEnd: { type: Date, required: true, index: true },
    trialStart: Date,
    trialEnd: Date,
    renewalDate: Date,
    cancellationDate: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancellationReason: { type: String, maxlength: 1000 },
    gracePeriodEnd: Date,
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, index: true },
    provider: { type: String, enum: ["STRIPE", "RAZORPAY", "TEST", "OFFLINE", "MANUAL"], required: true },
    providerCustomerId: String,
    providerSubscriptionId: String,
    assignedRegion: { type: String, required: true },
    overageApproved: { type: Boolean, default: false },
    pendingPlanId: { type: objectId, ref: "Plan" },
    pendingPlanEffectiveAt: Date,
    manualOverrides: {
      requestLimit: Number,
      companyAdminLimit: Number,
      dispatchUserLimit: Number,
      branchLimit: Number,
      enabledFeatures: [String],
      expiryDate: Date,
      internalNotes: { type: String, select: false },
    },
    paymentStatus: { type: String, default: "NOT_REQUIRED" },
    couponId: { type: objectId, ref: "Coupon" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  timestamps,
);
subscriptionSchema.index({ status: 1, renewalDate: 1 });
subscriptionSchema.index({ planId: 1, status: 1 });

const subscriptionUsageSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", required: true, index: true },
    billingCycleStart: { type: Date, required: true },
    billingCycleEnd: { type: Date, required: true },
    includedRequests: { type: Number, required: true, min: 0 },
    requestsUsed: { type: Number, default: 0, min: 0 },
    overageRequests: { type: Number, default: 0, min: 0 },
    addOnRequests: { type: Number, default: 0, min: 0 },
    addOnRequestsUsed: { type: Number, default: 0, min: 0 },
    manualAdjustment: { type: Number, default: 0 },
    consumptionKeys: { type: [String], default: [], select: false },
  },
  timestamps,
);
subscriptionUsageSchema.index({ subscriptionId: 1, billingCycleStart: 1 }, { unique: true });
subscriptionUsageSchema.index({ businessId: 1, billingCycleStart: -1 });

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", required: true, index: true },
    companyName: { type: String, required: true },
    billingAddress: { type: String, default: "" },
    taxIdentificationNumber: String,
    planName: { type: String, required: true },
    billingPeriodStart: { type: Date, required: true },
    billingPeriodEnd: { type: Date, required: true },
    baseAmount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    overageCharges: { type: Number, default: 0, min: 0 },
    addOnCharges: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    paymentStatus: { type: String, enum: ["DRAFT", "OPEN", "PAID", "FAILED", "VOID", "REFUNDED"], default: "OPEN" },
    paymentDate: Date,
    paymentReference: String,
    taxConfigurationReviewed: { type: Boolean, default: false },
    isTest: { type: Boolean, default: false },
  },
  timestamps,
);
invoiceSchema.index({ businessId: 1, createdAt: -1 });

const invoiceItemSchema = new Schema(
  {
    invoiceId: { type: objectId, ref: "Invoice", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    type: { type: String, enum: ["PLAN", "DISCOUNT", "OVERAGE", "ADD_ON", "TAX", "CREDIT"], required: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitAmount: { type: Number, required: true },
    amount: { type: Number, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  timestamps,
);
invoiceItemSchema.index({ invoiceId: 1, createdAt: 1 });

const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, required: true, maxlength: 1000 },
    type: {
      type: String,
      enum: ["PERCENTAGE", "FIXED_AMOUNT", "TRIAL_EXTENSION", "REQUEST_CREDITS", "ONE_TIME", "RECURRING"],
      required: true,
    },
    eligiblePlanIds: [{ type: objectId, ref: "Plan" }],
    eligibleBillingPeriods: [{ type: String, enum: ["MONTHLY", "ANNUAL"] }],
    currency: String,
    discountValue: { type: Number, required: true, min: 0 },
    maximumRedemptions: { type: Number, min: 1 },
    redemptionCount: { type: Number, default: 0, min: 0 },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    perCompanyUsageLimit: { type: Number, default: 1, min: 1 },
    newCustomersOnly: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    recurringCycles: { type: Number, min: 1 },
  },
  timestamps,
);
couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ active: 1, startDate: 1, expiryDate: 1 });

const couponRedemptionSchema = new Schema(
  {
    couponId: { type: objectId, ref: "Coupon", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", index: true },
    invoiceId: { type: objectId, ref: "Invoice" },
    discountAmount: { type: Number, default: 0 },
    requestCredits: { type: Number, default: 0 },
    trialDaysAdded: { type: Number, default: 0 },
    redeemedAt: { type: Date, default: Date.now },
  },
  timestamps,
);
couponRedemptionSchema.index({ couponId: 1, businessId: 1, redeemedAt: -1 });

const addOnPackSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    requests: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["INR", "USD", "CAD", "GBP", "EUR", "AED"], required: true },
    expiryDays: { type: Number, required: true, min: 1 },
    eligiblePlanIds: [{ type: objectId, ref: "Plan" }],
    active: { type: Boolean, default: true, index: true },
  },
  timestamps,
);
addOnPackSchema.index({ currency: 1, active: 1, requests: 1 });

const purchasedAddOnSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", required: true, index: true },
    addOnPackId: { type: objectId, ref: "AddOnPack", required: true },
    requestsPurchased: { type: Number, required: true },
    requestsUsed: { type: Number, default: 0 },
    price: { type: Number, required: true },
    currency: { type: String, required: true },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["PENDING", "ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"], default: "PENDING" },
    paymentId: { type: objectId, ref: "Payment" },
    isTest: { type: Boolean, default: false },
  },
  timestamps,
);
purchasedAddOnSchema.index({ businessId: 1, status: 1, expiresAt: 1 });

const billingEventSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", index: true },
    type: { type: String, required: true, index: true },
    idempotencyKey: { type: String, index: true },
    amount: Number,
    currency: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);
billingEventSchema.index({ businessId: 1, occurredAt: -1 });
billingEventSchema.index(
  { subscriptionId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

const paymentWebhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ["STRIPE", "RAZORPAY", "TEST"], required: true },
    externalEventId: { type: String, required: true },
    eventType: { type: String, required: true },
    payloadHash: { type: String, required: true },
    status: { type: String, enum: ["RECEIVED", "PROCESSED", "FAILED", "IGNORED"], default: "RECEIVED" },
    error: { type: String, maxlength: 2000 },
    processedAt: Date,
  },
  timestamps,
);
paymentWebhookEventSchema.index({ provider: 1, externalEventId: 1 }, { unique: true });

const manualPaymentSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", index: true },
    method: { type: String, enum: ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "MANUAL_INVOICE", "OTHER"], required: true },
    paymentReference: { type: String, required: true, trim: true },
    proofReference: String,
    paymentDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    internalNotes: { type: String, select: false, maxlength: 5000 },
    reviewedBy: { type: objectId, ref: "User" },
    reviewedAt: Date,
  },
  timestamps,
);
manualPaymentSchema.index({ businessId: 1, paymentReference: 1 }, { unique: true });

const subscriptionChangeSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", required: true, index: true },
    fromPlanId: { type: objectId, ref: "Plan" },
    toPlanId: { type: objectId, ref: "Plan" },
    type: { type: String, enum: ["UPGRADE", "DOWNGRADE", "CANCELLATION", "REACTIVATION", "RENEWAL", "MANUAL"], required: true },
    effectiveAt: { type: Date, required: true },
    status: { type: String, enum: ["PENDING", "APPLIED", "CANCELLED", "FAILED"], required: true },
    proratedAmount: { type: Number, default: 0 },
    currency: String,
    reason: String,
    actorId: { type: objectId, ref: "User" },
  },
  timestamps,
);
subscriptionChangeSchema.index({ subscriptionId: 1, createdAt: -1 });

const refundSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subscriptionId: { type: objectId, ref: "Subscription", index: true },
    paymentId: { type: objectId, ref: "Payment", required: true, index: true },
    invoiceId: { type: objectId, ref: "Invoice" },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    providerRefundId: { type: String, unique: true, sparse: true, index: true },
    reason: String,
    status: { type: String, enum: ["PENDING", "SUCCEEDED", "FAILED"], default: "PENDING" },
    isTest: { type: Boolean, default: false },
  },
  timestamps,
);
refundSchema.index({ businessId: 1, createdAt: -1 });

const branchSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    active: { type: Boolean, default: true },
  },
  timestamps,
);
branchSchema.index({ businessId: 1, code: 1 }, { unique: true });

export const Plan = registered("Plan", planSchema, "plans");
export const PlanPrice = registered("PlanPrice", planPriceSchema, "planPrices");
export const Subscription = registered("Subscription", subscriptionSchema, "subscriptions");
export const SubscriptionUsage = registered("SubscriptionUsage", subscriptionUsageSchema, "subscriptionUsages");
export const Invoice = registered("Invoice", invoiceSchema, "invoices");
export const InvoiceItem = registered("InvoiceItem", invoiceItemSchema, "invoiceItems");
export const Coupon = registered("Coupon", couponSchema, "coupons");
export const CouponRedemption = registered("CouponRedemption", couponRedemptionSchema, "couponRedemptions");
export const AddOnPack = registered("AddOnPack", addOnPackSchema, "addOnPacks");
export const PurchasedAddOn = registered("PurchasedAddOn", purchasedAddOnSchema, "purchasedAddOns");
export const BillingEvent = registered("BillingEvent", billingEventSchema, "billingEvents");
export const PaymentWebhookEvent = registered("PaymentWebhookEvent", paymentWebhookEventSchema, "paymentWebhookEvents");
export const ManualPayment = registered("ManualPayment", manualPaymentSchema, "manualPayments");
export const SubscriptionChange = registered("SubscriptionChange", subscriptionChangeSchema, "subscriptionChanges");
export const Refund = registered("Refund", refundSchema, "refunds");
export const Branch = registered("Branch", branchSchema, "branches");
