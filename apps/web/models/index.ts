/* eslint-disable @typescript-eslint/no-explicit-any */
import { Schema, model, models, type Model } from "mongoose";
import { ASSET_TYPES, JOB_STATUSES, USER_ROLES } from "@bsocio/shared-types";

const objectId = Schema.Types.ObjectId;
const timestamps = { timestamps: true, versionKey: false } as const;

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true },
    country: { type: String, required: true, trim: true },
    countryCallingCode: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    googleSubject: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: "CUSTOMER" },
    businessId: { type: objectId, ref: "Business", index: true },
    companyRole: { type: String, enum: ["COMPANY_ADMIN", "DISPATCH"], default: "COMPANY_ADMIN" },
    emailVerifiedAt: Date,
    suspendedAt: Date,
    suspensionReason: String,
    sessionVersion: { type: Number, required: true, default: 1 },
    verificationTokenHash: { type: String, select: false },
    verificationExpiresAt: Date,
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: Date,
    lastLoginAt: Date,
    locale: { type: String, default: "en" },
    timeZone: { type: String, default: "UTC" },
  },
  timestamps,
);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleSubject: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, createdAt: -1 });

const businessSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String, required: true },
    country: { type: String, required: true },
    billingRegion: { type: String, enum: ["INDIA", "UNITED_STATES", "CANADA", "UNITED_KINGDOM", "EUROPE", "MIDDLE_EAST", "OTHER"] },
    billingAddress: String,
    taxIdentificationNumber: String,
    website: String,
    whatsapp: String,
    instagram: String,
    primaryColour: { type: String, default: "#2563EB" },
    onboardingComplete: { type: Boolean, default: false },
    demoProductCount: { type: Number, default: 0, min: 0 },
    demoJobCount: { type: Number, default: 0, min: 0 },
    demoQrCount: { type: Number, default: 0, min: 0 },
    demoArCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
  },
  timestamps,
);
businessSchema.index({ slug: 1 }, { unique: true });

const demoProjectSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true },
    name: { type: String, required: true },
    notes: String,
    status: { type: String, enum: JOB_STATUSES, default: "UPLOADED", index: true },
    submittedAt: Date,
    approvedAt: Date,
  },
  timestamps,
);
demoProjectSchema.index({ businessId: 1 }, { unique: true });
demoProjectSchema.index({ createdAt: -1 });

const dimensionsSchema = new Schema(
  {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    depth: { type: Number, required: true },
    unit: { type: String, enum: ["mm", "cm", "m", "in", "ft"], required: true },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    demoProjectId: { type: objectId, ref: "DemoProject", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    dimensions: { type: dimensionsSchema, required: true },
    material: { type: String, required: true },
    colour: { type: String, required: true },
    price: Number,
    currency: String,
    customerNotes: String,
    mainImageAssetId: { type: objectId, ref: "Asset" },
    frontImageAssetId: { type: objectId, ref: "Asset" },
    backImageAssetId: { type: objectId, ref: "Asset" },
    leftImageAssetId: { type: objectId, ref: "Asset" },
    rightImageAssetId: { type: objectId, ref: "Asset" },
    topImageAssetId: { type: objectId, ref: "Asset" },
    supportingAssetIds: [{ type: objectId, ref: "Asset" }],
    approvalStatus: { type: String, enum: JOB_STATUSES, default: "UPLOADED", index: true },
    version: { type: Number, default: 1 },
    scale: { type: Number, default: 1 },
    cameraOrbit: String,
  },
  timestamps,
);
productSchema.index({ businessId: 1, slug: 1 }, { unique: true });
productSchema.index({ demoProjectId: 1, createdAt: 1 });
productSchema.index({ createdAt: -1 });

const assetSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    productId: { type: objectId, ref: "Product", index: true },
    paymentId: { type: objectId, ref: "Payment", index: true },
    assetType: { type: String, enum: ASSET_TYPES, required: true, index: true },
    objectKey: { type: String, required: true, unique: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
    checksumSha256: { type: String, required: true },
    etag: String,
    visibility: { type: String, enum: ["PRIVATE", "PUBLIC_APPROVED"], default: "PRIVATE" },
    status: {
      type: String,
      enum: ["PENDING_UPLOAD", "UPLOADED", "VALIDATED", "REJECTED", "DELETED"],
      default: "PENDING_UPLOAD",
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  timestamps,
);
assetSchema.index({ ownerId: 1, productId: 1, checksumSha256: 1 }, { unique: true });
assetSchema.index({ createdAt: -1 });

const threeDJobSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    productId: { type: objectId, ref: "Product", required: true },
    sourceAssetId: { type: objectId, ref: "Asset", required: true },
    status: { type: String, enum: JOB_STATUSES, required: true, default: "QUEUED", index: true },
    progress: { type: Number, min: 0, max: 100, default: 2 },
    currentStep: { type: String, default: "Waiting for processing." },
    workerId: { type: String, index: true },
    attempts: { type: Number, default: 0 },
    errorCode: String,
    customerSafeError: String,
    internalTechnicalError: { type: String, select: false },
    lockTimestamp: { type: Date, index: true },
    leaseToken: { type: String, select: false },
    startedAt: Date,
    completedAt: Date,
    availableAt: { type: Date, default: Date.now, index: true },
    outputModelId: { type: objectId, ref: "Model3D" },
  },
  timestamps,
);
threeDJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
threeDJobSchema.index({ businessId: 1, status: 1 });
threeDJobSchema.index({ productId: 1 }, { unique: true });

const model3DSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    productId: { type: objectId, ref: "Product", required: true, index: true },
    jobId: { type: objectId, ref: "ThreeDJob", required: true, index: true },
    glbAssetId: { type: objectId, ref: "Asset", required: true },
    usdzAssetId: { type: objectId, ref: "Asset" },
    thumbnailAssetId: { type: objectId, ref: "Asset" },
    version: { type: Number, required: true, default: 1 },
    status: { type: String, enum: JOB_STATUSES, default: "READY_FOR_REVIEW", index: true },
    fileSize: Number,
    polygonCount: Number,
    validationWarnings: [String],
    technicallyValid: { type: Boolean, default: false },
    scale: { type: Number, default: 1 },
    orientation: { x: Number, y: Number, z: Number },
  },
  timestamps,
);
model3DSchema.index({ productId: 1, version: -1 }, { unique: true });

const arExperienceSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    productId: { type: objectId, ref: "Product", required: true, unique: true, index: true },
    modelId: { type: objectId, ref: "Model3D", required: true },
    draftSlug: { type: String, required: true, unique: true },
    publicSlug: { type: String, sparse: true, unique: true },
    status: { type: String, enum: JOB_STATUSES, default: "READY_FOR_REVIEW", index: true },
    title: String,
    description: String,
    price: Number,
    currency: String,
    whatsappUrl: String,
    websiteUrl: String,
    instagramUrl: String,
    contactUrl: String,
    modelScale: { type: Number, default: 1 },
    cameraOrbit: String,
    opens: { type: Number, default: 0 },
    publishedAt: Date,
  },
  timestamps,
);
arExperienceSchema.index({ businessId: 1, status: 1 });

const qrCodeSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    productId: { type: objectId, ref: "Product", required: true, unique: true, index: true },
    arExperienceId: { type: objectId, ref: "ArExperience", required: true },
    uniqueCode: { type: String, required: true, unique: true, index: true },
    destinationPath: { type: String, required: true },
    foreground: { type: String, default: "#0F172A" },
    background: { type: String, default: "#FFFFFF" },
    errorCorrectionLevel: { type: String, enum: ["L", "M", "Q", "H"], default: "H" },
    size: { type: Number, default: 1024 },
    callToAction: { type: String, default: "View in AR" },
    logoAssetId: { type: objectId, ref: "Asset" },
    pngAssetId: { type: objectId, ref: "Asset" },
    transparentPngAssetId: { type: objectId, ref: "Asset" },
    svgAssetId: { type: objectId, ref: "Asset" },
    printAssetId: { type: objectId, ref: "Asset" },
    scans: { type: Number, default: 0 },
    active: { type: Boolean, default: false, index: true },
  },
  timestamps,
);

const approvalSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    demoProjectId: { type: objectId, ref: "DemoProject", required: true, index: true },
    productId: { type: objectId, ref: "Product", required: true, index: true },
    reviewerId: { type: objectId, ref: "User", required: true },
    decision: { type: String, required: true },
    customerFeedback: String,
    internalNotes: String,
    productVersion: Number,
    modelVersion: Number,
  },
  timestamps,
);
approvalSchema.index({ productId: 1, createdAt: -1 });

const customPackageSchema = new Schema(
  {
    customerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    demoProjectId: { type: objectId, ref: "DemoProject", required: true },
    name: { type: String, required: true },
    currency: { type: String, required: true },
    setupFee: { type: Number, required: true },
    monthlyFee: Number,
    annualFee: Number,
    tax: Number,
    discount: Number,
    productLimit: Number,
    qrLimit: Number,
    arLimit: Number,
    futureThreeDGenerationLimit: Number,
    storageGb: Number,
    trafficGb: Number,
    analyticsLevel: String,
    brandingOptions: [String],
    supportLevel: String,
    deliveryTimeline: String,
    renewalRules: String,
    expiresAt: Date,
    customTerms: String,
    customerNotes: String,
    internalNotes: String,
    status: { type: String, enum: ["DRAFT", "OFFERED", "ACCEPTED", "EXPIRED", "CANCELLED"], default: "DRAFT" },
    acceptedAt: Date,
  },
  timestamps,
);
customPackageSchema.index({ businessId: 1, createdAt: -1 });

const paymentSchema = new Schema(
  {
    customerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    packageId: { type: objectId, ref: "CustomPackage" },
    subscriptionId: { type: objectId, ref: "Subscription", index: true },
    invoiceId: { type: objectId, ref: "Invoice" },
    method: { type: String, enum: ["BANK_TRANSFER", "UPI", "OFFLINE", "CARD", "TEST"], required: true },
    provider: { type: String, enum: ["STRIPE", "RAZORPAY", "TEST", "OFFLINE"], default: "OFFLINE" },
    providerPaymentId: String,
    providerCheckoutId: String,
    purpose: { type: String, enum: ["SUBSCRIPTION", "UPGRADE", "ADD_ON", "OFFLINE_PACKAGE"], default: "OFFLINE_PACKAGE" },
    targetPlanId: { type: objectId, ref: "Plan" },
    targetAddOnPackId: { type: objectId, ref: "AddOnPack" },
    targetBillingPeriod: { type: String, enum: ["MONTHLY", "ANNUAL"] },
    couponId: { type: objectId, ref: "Coupon" },
    transactionReference: { type: String, required: true, index: true },
    proofAssetId: { type: objectId, ref: "Asset" },
    amount: { type: Number, min: 0 },
    currency: String,
    isTest: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed, default: {} },
    customerNotes: String,
    adminNotes: String,
    status: { type: String, enum: ["PENDING", "TEST_PENDING", "SUBMITTED", "VERIFIED", "COMPLETED", "FAILED", "REJECTED", "CLARIFICATION_REQUESTED", "REFUNDED"], default: "SUBMITTED", index: true },
    reviewedBy: { type: objectId, ref: "User" },
    reviewedAt: Date,
  },
  timestamps,
);
paymentSchema.index({ businessId: 1, transactionReference: 1 }, { unique: true });
paymentSchema.index({ packageId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ createdAt: -1 });

const rateLimitBucketSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false },
);
rateLimitBucketSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const notificationSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    href: String,
    readAt: Date,
  },
  timestamps,
);
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

const analyticsEventSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", index: true },
    productId: { type: objectId, ref: "Product", index: true },
    arExperienceId: { type: objectId, ref: "ArExperience", index: true },
    qrCodeId: { type: objectId, ref: "QrCode", index: true },
    eventType: { type: String, required: true, index: true },
    sessionHash: String,
    country: String,
    deviceType: String,
    referrer: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);
analyticsEventSchema.index({ businessId: 1, occurredAt: -1 });

const auditLogSchema = new Schema(
  {
    actorId: { type: objectId, ref: "User", index: true },
    businessId: { type: objectId, ref: "Business", index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: String,
    ipHash: String,
    userAgent: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    success: { type: Boolean, default: true },
    reason: String,
  },
  timestamps,
);
auditLogSchema.index({ createdAt: -1 });

const workerHeartbeatSchema = new Schema(
  {
    workerId: { type: String, required: true, unique: true },
    lastHeartbeat: { type: Date, required: true, index: true },
    currentJobId: { type: objectId, ref: "ThreeDJob" },
    queueLength: { type: Number, default: 0 },
    deviceType: { type: String, enum: ["cpu", "cuda"] },
    workerVersion: String,
    hostname: String,
  },
  timestamps,
);
workerHeartbeatSchema.index({ lastHeartbeat: -1 });

const supportTicketSchema = new Schema(
  {
    ownerId: { type: objectId, ref: "User", required: true, index: true },
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    category: { type: String, enum: ["ACCOUNT", "UPLOAD", "3D_GENERATION", "AR_QR", "PACKAGE_PAYMENT", "OTHER"], required: true },
    description: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ["OPEN", "WAITING_CUSTOMER", "RESOLVED"], default: "OPEN", index: true },
    priority: { type: String, enum: ["NORMAL", "HIGH", "URGENT"], default: "NORMAL" },
    customerReply: String,
    adminResponse: String,
    assignedTo: { type: objectId, ref: "User" },
    resolvedAt: Date,
  },
  timestamps,
);
supportTicketSchema.index({ status: 1, updatedAt: -1 });

type LooseModel = Model<any>;
const registered = (name: string, schema: Schema, collection: string): LooseModel =>
  (models[name] as LooseModel | undefined) ?? model<any>(name, schema, collection);

export const User = registered("User", userSchema, "users");
export const Business = registered("Business", businessSchema, "businesses");
export const DemoProject = registered("DemoProject", demoProjectSchema, "demoProjects");
export const Product = registered("Product", productSchema, "products");
export const Asset = registered("Asset", assetSchema, "assets");
export const ThreeDJob = registered("ThreeDJob", threeDJobSchema, "threeDJobs");
export const Model3D = registered("Model3D", model3DSchema, "models3D");
export const ArExperience = registered("ArExperience", arExperienceSchema, "arExperiences");
export const QrCode = registered("QrCode", qrCodeSchema, "qrCodes");
export const Approval = registered("Approval", approvalSchema, "approvals");
export const CustomPackage = registered("CustomPackage", customPackageSchema, "customPackages");
export const Payment = registered("Payment", paymentSchema, "payments");
export const Notification = registered("Notification", notificationSchema, "notifications");
export const AnalyticsEvent = registered("AnalyticsEvent", analyticsEventSchema, "analyticsEvents");
export const AuditLog = registered("AuditLog", auditLogSchema, "auditLogs");
export const WorkerHeartbeat = registered("WorkerHeartbeat", workerHeartbeatSchema, "workerHeartbeats");
export const RateLimitBucket = registered("RateLimitBucket", rateLimitBucketSchema, "rateLimitBuckets");
export const SupportTicket = registered("SupportTicket", supportTicketSchema, "supportTickets");

export * from "./billing";
export * from "./commerce";
