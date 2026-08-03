import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ADMIN_ROLES, type UserRole } from "@bsocio/shared-types";
import { getDemoLimits, readPositiveInteger } from "@bsocio/constants";
import {
  businessSchema, createJobSchema, customerAccountActionSchema, demoProjectSchema, forgotPasswordSchema, loginSchema,
  packageSchema, paymentSubmissionSchema, productSchema, registrationSchema, resetPasswordSchema,
  replacementUploadSchema, reviewSchema, teamMemberSchema, uploadConfirmationSchema, uploadIntentSchema,
} from "@bsocio/validation";
import {
  buildPrivateObjectKey, confirmPrivateObject, createSignedPrivateDownload, createSignedUpload, sha256HexToBase64,
  publishApprovedObject, validateImageIntent, validatePaymentProofIntent, validateReplacementIntent,
} from "@bsocio/storage";
import { createQrSvg } from "@bsocio/qr-engine";
import {
  clearSessionCookie, createOpaqueToken, hashOpaqueToken, hashPassword, requireAuth,
  setSessionCookie, toSessionUser, verifyLoginPassword, verifyPassword,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { dbConnect } from "@/lib/db";
import { getEnvironment, getR2Settings } from "@/lib/env";
import { fail, getClientIp, HttpError, ok, pagination, readJson } from "@/lib/http";
import { enforceDatabaseRateLimit } from "@/lib/rate-limit";
import {
  AnalyticsEvent, Approval, ArExperience, Asset, AuditLog, BillingEvent, Business, CommerceProductProfile, CustomPackage, DemoProject, JewellerySettings, Model3D,
  Notification, Payment, Product, QrCode, Subscription, SubscriptionUsage, SupportTicket, ThreeDJob, User, WorkerHeartbeat,
} from "@/models";
import { ensureDraftExperience, makeSlug, ownerFilter, requireOwnedBusiness, requireOwnedProduct } from "@/services/core";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/services/email";
import { handleBillingGet, handleBillingPatch, handleBillingPost } from "@/services/billing/api";
import { canCreateLocationRequest, consumeLocationRequest, startTrialSubscription } from "@/services/billing/service";
import {
  handleCommerceDelete,
  handleCommerceGet,
  handleCommercePatch,
  handleCommercePost,
} from "@/services/commerce/api";
import { optionalDiningSession } from "@/services/commerce/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ segments: string[] }> };

const tokenSchema = z.object({ token: z.string().min(32).max(512) }).strict();
const packageAcceptSchema = z.object({ packageId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const productResubmitSchema = z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const paymentReviewSchema = z.object({
  paymentId: z.string().regex(/^[a-f\d]{24}$/i),
  decision: z.enum(["VERIFIED", "REJECTED", "CLARIFICATION_REQUESTED"]),
  adminNotes: z.string().trim().max(3000).optional(),
}).strict();
const publishSchema = z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const adminProductUpdateSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  dimensions: z.object({ width: z.number().positive().max(1_000_000), height: z.number().positive().max(1_000_000), depth: z.number().positive().max(1_000_000), unit: z.enum(["mm", "cm", "m", "in", "ft"]) }).strict().optional(),
  material: z.string().trim().min(1).max(120).optional(),
  colour: z.string().trim().min(1).max(120).optional(),
  price: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
  scale: z.number().positive().max(1000).optional(),
  cameraOrbit: z.string().trim().max(120).nullable().optional(),
}).strict();
const qrUpdateSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i),
  destinationPath: z.string().trim().startsWith("/ar/").max(240),
  foreground: z.string().regex(/^#[0-9A-F]{6}$/i),
  background: z.string().regex(/^#[0-9A-F]{6}$/i),
  errorCorrectionLevel: z.enum(["L", "M", "Q", "H"]),
  size: z.number().int().min(256).max(2048),
  callToAction: z.string().trim().min(2).max(80),
}).strict();
const accountProfileSchema = z.object({ fullName: z.string().trim().min(2).max(100), country: z.string().trim().min(2).max(100), countryCallingCode: z.string().trim().regex(/^\+\d{1,4}$/), mobileNumber: z.string().trim().regex(/^\d{6,18}$/) }).strict();
const accountSettingsSchema = z.object({ locale: z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/), timeZone: z.string().trim().min(1).max(100) }).strict();
const accountPasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).regex(/[^A-Za-z0-9]/) }).strict();
const supportTicketSchema = z.object({ subject: z.string().trim().min(3).max(180), category: z.enum(["ACCOUNT", "UPLOAD", "3D_GENERATION", "AR_QR", "PACKAGE_PAYMENT", "OTHER"]), description: z.string().trim().min(10).max(5000), priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL") }).strict();
const supportResponseSchema = z.object({ ticketId: z.string().regex(/^[a-f\d]{24}$/i), response: z.string().trim().min(3).max(5000), status: z.enum(["WAITING_CUSTOMER", "RESOLVED"]) }).strict();
const notificationReadSchema = z.object({ notificationId: z.string().regex(/^[a-f\d]{24}$/i).optional() }).strict();

const PRODUCT_REVIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER", "AR_PUBLISHER"];
const ADMIN_SECTION_ROLES: Record<string, UserRole[]> = {
  customers: ["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER"], businesses: ["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER"],
  "demo-projects": ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "SUPPORT_MANAGER"], products: ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER", "AR_PUBLISHER", "SUPPORT_MANAGER"],
  uploads: ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER"], "job-queue": ["SUPER_ADMIN", "ADMIN", "THREE_D_REVIEWER"], models: ["SUPER_ADMIN", "ADMIN", "THREE_D_REVIEWER", "AR_PUBLISHER"],
  "ar-experiences": ["SUPER_ADMIN", "ADMIN", "AR_PUBLISHER"], "qr-codes": ["SUPER_ADMIN", "ADMIN", "AR_PUBLISHER"], "team-members": ["SUPER_ADMIN", "ADMIN"],
  "audit-logs": ["SUPER_ADMIN", "ADMIN"], "storage-usage": ["SUPER_ADMIN", "ADMIN", "THREE_D_REVIEWER"], analytics: ["SUPER_ADMIN", "ADMIN"],
  support: ["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER"],
};

function requireRole(auth: { role: UserRole }, roles: readonly UserRole[], message = "You do not have permission to access this resource.") {
  if (!roles.includes(auth.role)) throw new HttpError(403, "FORBIDDEN", message);
}

async function routePath(context: RouteContext): Promise<string> {
  return (await context.params).segments.join("/");
}

function publicUser(user: { _id: { toString(): string }; fullName: string; email: string; role: string; businessId?: unknown }) {
  return { id: user._id.toString(), fullName: user.fullName, email: user.email, role: user.role, businessId: user.businessId ? String(user.businessId) : undefined };
}

async function register(request: NextRequest) {
  const input = await readJson(request, registrationSchema);
  await dbConnect();
  if (await User.exists({ email: input.email })) throw new HttpError(409, "EMAIL_EXISTS", "An account already uses this email.");
  const verification = createOpaqueToken();
  const env = getEnvironment();
  const user = await User.create({
    fullName: input.fullName, email: input.email, country: input.country,
    countryCallingCode: input.countryCallingCode, mobileNumber: input.mobileNumber,
    passwordHash: await hashPassword(input.password), role: "CUSTOMER",
    verificationTokenHash: verification.hash,
    verificationExpiresAt: new Date(Date.now() + readPositiveInteger(env.EMAIL_VERIFICATION_TTL_HOURS, 24) * 3_600_000),
  });
  try {
    const base = makeSlug(input.businessName);
    const slug = (await Business.exists({ slug: base })) ? `${base}-${randomBytes(3).toString("hex")}` : base;
    const business = await Business.create({ ownerId: user._id, name: input.businessName, slug, category: input.businessCategory, country: input.country, onboardingComplete: false });
    user.businessId = business._id;
    await user.save();
    await startTrialSubscription(business._id.toString(), user._id.toString());
    await Notification.create({ userId: user._id, businessId: business._id, type: "VERIFY_EMAIL", title: "Verify your email", message: "Verify your email address to secure your B Socio AR account." });
    await writeAudit({ actorId: user._id.toString(), businessId: business._id.toString(), action: "CUSTOMER_REGISTERED", entityType: "User", entityId: user._id.toString(), request });
    if (env.ALLOW_DEMO_MODE !== "true") await sendVerificationEmail(user.email, verification.raw);
    return ok({ user: publicUser(user), verificationRequired: true, ...(env.ALLOW_DEMO_MODE === "true" ? { developmentVerificationToken: verification.raw } : {}) }, 201);
  } catch (error) {
    const failedBusiness = await Business.findOne({ ownerId: user._id }).select("_id").lean();
    if (failedBusiness && !Array.isArray(failedBusiness)) {
      await Promise.all([
        SubscriptionUsage.deleteMany({ businessId: failedBusiness._id }),
        Subscription.deleteMany({ businessId: failedBusiness._id }),
        BillingEvent.deleteMany({ businessId: failedBusiness._id }),
      ]);
    }
    await Promise.all([Business.deleteOne({ ownerId: user._id }), Notification.deleteMany({ userId: user._id })]);
    await User.deleteOne({ _id: user._id });
    throw error;
  }
}

async function login(request: NextRequest, admin: boolean) {
  const input = await readJson(request, loginSchema);
  const env = getEnvironment();
  await dbConnect();
  await enforceDatabaseRateLimit(`${admin ? "admin" : "customer"}:${getClientIp(request)}:${input.email}`, readPositiveInteger(env.LOGIN_RATE_LIMIT_MAX, 8), readPositiveInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS, 900_000));
  let user = await User.findOne({ email: input.email }).select("+passwordHash");
  const bootstrapHash = admin && env.SUPER_ADMIN_EMAIL?.toLowerCase() === input.email
    ? env.SUPER_ADMIN_PASSWORD_HASH
    : undefined;
  const credentialSource = await verifyLoginPassword(input.password, user?.passwordHash, bootstrapHash);
  if (!credentialSource) {
    await writeAudit({ action: admin ? "ADMIN_LOGIN_FAILED" : "CUSTOMER_LOGIN_FAILED", entityType: "User", request, success: false, reason: "Invalid credentials" });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  if (credentialSource === "bootstrap") {
    user = await User.findOneAndUpdate(
      { email: input.email },
      { $set: { fullName: "Super Administrator", role: "SUPER_ADMIN", passwordHash: bootstrapHash, suspendedAt: null }, $setOnInsert: { country: "Configured", countryCallingCode: "+1", mobileNumber: "000000", sessionVersion: 1, emailVerifiedAt: new Date() } },
      { new: true, upsert: true },
    ).select("+passwordHash");
  }
  if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  if (user.suspendedAt) throw new HttpError(403, "ACCOUNT_SUSPENDED", "This account is suspended. Contact support.");
  if (!admin && !user.emailVerifiedAt) throw new HttpError(403, "EMAIL_NOT_VERIFIED", "Verify your email address before signing in.");
  const isAdmin = ADMIN_ROLES.includes(user.role);
  if (admin !== isAdmin) throw new HttpError(403, "WRONG_LOGIN_PORTAL", admin ? "Use a customer account on the customer login page." : "Use the administrator login page.");
  user.lastLoginAt = new Date();
  await user.save();
  await setSessionCookie(toSessionUser(user));
  await writeAudit({ actorId: user._id.toString(), businessId: user.businessId?.toString(), action: admin ? "ADMIN_LOGIN" : "CUSTOMER_LOGIN", entityType: "User", entityId: user._id.toString(), request });
  return ok({ user: publicUser(user), redirectTo: admin ? "/admin" : "/dashboard" });
}

async function forgotPassword(request: NextRequest) {
  const input = await readJson(request, forgotPasswordSchema);
  const env = getEnvironment();
  await dbConnect();
  await enforceDatabaseRateLimit(`forgot:${getClientIp(request)}:${input.email}`, 4, 3_600_000);
  const user = await User.findOne({ email: input.email });
  let developmentResetToken: string | undefined;
  const requestedAdminPortal = input.portal === "admin";
  if (user && requestedAdminPortal === ADMIN_ROLES.includes(user.role)) {
    const reset = createOpaqueToken();
    user.resetTokenHash = reset.hash;
    user.resetTokenExpiresAt = new Date(Date.now() + readPositiveInteger(env.PASSWORD_RESET_TTL_MINUTES, 30) * 60_000);
    await user.save();
    await Notification.create({ userId: user._id, businessId: user.businessId, type: "PASSWORD_RESET", title: "Password reset requested", message: "A time-limited password reset was requested for your account." });
    if (env.ALLOW_DEMO_MODE === "true") developmentResetToken = reset.raw;
    else await sendPasswordResetEmail(user.email, reset.raw, requestedAdminPortal);
  }
  return ok({ message: "If the account exists, password-reset instructions have been created.", ...(developmentResetToken ? { developmentResetToken } : {}) });
}

async function resetPassword(request: NextRequest) {
  const input = await readJson(request, resetPasswordSchema);
  await dbConnect();
  const user = await User.findOne({ resetTokenHash: hashOpaqueToken(input.token), resetTokenExpiresAt: { $gt: new Date() } }).select("+resetTokenHash");
  if (!user) throw new HttpError(400, "RESET_TOKEN_INVALID", "This reset link is invalid or expired.");
  user.passwordHash = await hashPassword(input.password);
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  user.sessionVersion += 1;
  await user.save();
  await writeAudit({ actorId: user._id.toString(), businessId: user.businessId?.toString(), action: "PASSWORD_RESET", entityType: "User", entityId: user._id.toString(), request });
  return ok({
    message: "Password updated. Sign in with your new password.",
    redirectTo: ADMIN_ROLES.includes(user.role) ? "/admin/login?reset=1" : "/login?reset=1",
  });
}

async function verifyEmail(request: NextRequest) {
  const { token } = await readJson(request, tokenSchema);
  await dbConnect();
  const user = await User.findOne({ verificationTokenHash: hashOpaqueToken(token), verificationExpiresAt: { $gt: new Date() } }).select("+verificationTokenHash");
  if (!user) throw new HttpError(400, "VERIFICATION_TOKEN_INVALID", "This verification link is invalid or expired.");
  user.emailVerifiedAt = new Date();
  user.verificationTokenHash = undefined;
  user.verificationExpiresAt = undefined;
  await user.save();
  return ok({ message: "Email verified successfully." });
}

async function updateAccountProfile(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, accountProfileSchema);
  const user = await User.findByIdAndUpdate(auth.id, { $set: input }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
  await setSessionCookie(toSessionUser(user));
  await writeAudit({ actorId: auth.id, businessId: auth.businessId, action: "ACCOUNT_PROFILE_UPDATED", entityType: "User", entityId: auth.id, request });
  return ok({ user: publicUser(user), country: user.country, countryCallingCode: user.countryCallingCode, mobileNumber: user.mobileNumber });
}

async function updateAccountSettings(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, accountSettingsSchema);
  const user = await User.findByIdAndUpdate(auth.id, { $set: input }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
  return ok({ locale: user.locale, timeZone: user.timeZone });
}

async function changeAccountPassword(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, accountPasswordSchema);
  const user = await User.findById(auth.id).select("+passwordHash");
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) throw new HttpError(401, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
  user.passwordHash = await hashPassword(input.newPassword);
  user.sessionVersion += 1;
  await user.save();
  await setSessionCookie(toSessionUser(user));
  await writeAudit({ actorId: auth.id, businessId: auth.businessId, action: "ACCOUNT_PASSWORD_CHANGED", entityType: "User", entityId: auth.id, request });
  return ok({ message: "Password changed. Other sessions were signed out." });
}

async function revokeAccountSessions(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  await User.updateOne({ _id: auth.id }, { $inc: { sessionVersion: 1 } });
  await clearSessionCookie();
  await writeAudit({ actorId: auth.id, businessId: auth.businessId, action: "ACCOUNT_SESSIONS_REVOKED", entityType: "User", entityId: auth.id, request });
  return ok({ message: "All sessions were signed out." });
}

async function createSupportTicket(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, supportTicketSchema);
  if (!auth.businessId) throw new HttpError(409, "ONBOARDING_REQUIRED", "Complete business onboarding before opening support requests.");
  await enforceDatabaseRateLimit(`support:${auth.id}`, 10, 60 * 60_000);
  const ticket = await SupportTicket.create({ ownerId: auth.id, businessId: auth.businessId, ...input, status: "OPEN" });
  await writeAudit({ actorId: auth.id, businessId: auth.businessId, action: "SUPPORT_TICKET_CREATED", entityType: "SupportTicket", entityId: ticket._id.toString(), request });
  return ok(ticket, 201);
}

async function respondSupportTicket(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER"]);
  const input = await readJson(request, supportResponseSchema);
  const ticket = await SupportTicket.findOneAndUpdate({ _id: input.ticketId, status: { $ne: "RESOLVED" } }, { $set: { adminResponse: input.response, status: input.status, assignedTo: auth.id, resolvedAt: input.status === "RESOLVED" ? new Date() : undefined } }, { new: true, runValidators: true });
  if (!ticket) throw new HttpError(409, "SUPPORT_TICKET_NOT_OPEN", "This support ticket is unavailable or already resolved.");
  await Notification.create({ userId: ticket.ownerId, businessId: ticket.businessId, type: "SUPPORT_UPDATED", title: `Support request: ${ticket.subject}`, message: input.response, href: "/dashboard/support" });
  await writeAudit({ actorId: auth.id, businessId: ticket.businessId.toString(), action: `SUPPORT_${input.status}`, entityType: "SupportTicket", entityId: ticket._id.toString(), request });
  return ok(ticket);
}

async function markNotificationsRead(request: NextRequest) {
  const auth = await requireAuth(request);
  const input = await readJson(request, notificationReadSchema);
  const filter = { userId: auth.id, readAt: { $exists: false }, ...(input.notificationId ? { _id: input.notificationId } : {}) };
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return ok({ updated: result.modifiedCount });
}

async function saveBusiness(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, businessSchema);
  const current = await Business.findOne({ ownerId: auth.id });
  if (current && current.slug !== input.slug && await ArExperience.exists({ businessId: current._id, status: "PUBLISHED" })) throw new HttpError(409, "PUBLISHED_SLUG_IMMUTABLE", "The business URL cannot change after an AR experience is published because printed QR links depend on it.");
  if (await Business.exists({ slug: input.slug, ownerId: { $ne: auth.id } })) throw new HttpError(409, "SLUG_EXISTS", "This business URL is already in use.");
  const business = await Business.findOneAndUpdate({ ownerId: auth.id }, { $set: { ...input, onboardingComplete: true } }, { new: true, upsert: true, runValidators: true });
  await User.updateOne({ _id: auth.id }, { $set: { businessId: business._id } });
  await writeAudit({ actorId: auth.id, businessId: business._id.toString(), action: "BUSINESS_ONBOARDED", entityType: "Business", entityId: business._id.toString(), request });
  return ok(business);
}

async function createDemo(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, demoProjectSchema);
  const business = await requireOwnedBusiness(auth);
  if (!business.onboardingComplete) throw new HttpError(409, "ONBOARDING_INCOMPLETE", "Complete business onboarding before creating a demo.");
  if (await DemoProject.exists({ businessId: business._id })) throw new HttpError(409, "DEMO_LIMIT_REACHED", "Your business can create one demo project.");
  return ok(await DemoProject.create({ ownerId: auth.id, businessId: business._id, ...input, status: "UPLOADED" }), 201);
}

async function createProduct(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, productSchema);
  const business = await requireOwnedBusiness(auth);
  const billing = await canCreateLocationRequest(business._id.toString());
  if (!billing.allowed) {
    throw new HttpError(
      409,
      billing.reason ?? "SUBSCRIPTION_RESTRICTED",
      billing.reason === "REQUEST_LIMIT_REACHED"
        ? "Monthly request limit reached. Upgrade your plan or contact support."
        : "Your subscription does not currently allow new requests.",
    );
  }
  const demo = await DemoProject.findOne({ _id: input.demoProjectId, businessId: business._id, ownerId: auth.id, status: "UPLOADED" });
  if (!demo) throw new HttpError(404, "DEMO_NOT_FOUND", "Demo project not found.");
  const limits = getDemoLimits();
  const reserved = await Business.findOneAndUpdate({ _id: business._id, demoProductCount: { $lt: limits.products } }, { $inc: { demoProductCount: 1 } }, { new: true });
  if (!reserved) throw new HttpError(409, "PRODUCT_LIMIT_REACHED", `The demo includes up to ${limits.products} products. Remove a draft or contact B Socio for a custom package.`);
  try {
    const product = await Product.create({ ownerId: auth.id, businessId: business._id, ...input, approvalStatus: "UPLOADED" });
    await writeAudit({ actorId: auth.id, businessId: business._id.toString(), action: "PRODUCT_CREATED", entityType: "Product", entityId: product._id.toString(), request });
    return ok(product, 201);
  } catch (error) {
    await Business.updateOne({ _id: business._id }, { $inc: { demoProductCount: -1 } });
    throw error;
  }
}

async function createUploadIntent(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, uploadIntentSchema);
  const originalName = input.originalName.replace(/[\\/]/g, "_");
  if (input.assetType === "PAYMENT_PROOF") {
    if (!input.packageId) throw new HttpError(422, "PACKAGE_REQUIRED", "Choose the accepted package for this payment proof.");
    const customPackage = await CustomPackage.findOne({ _id: input.packageId, customerId: auth.id, status: "ACCEPTED", expiresAt: { $gt: new Date() } });
    if (!customPackage) throw new HttpError(409, "PACKAGE_NOT_ACCEPTED", "Accept an active package before uploading payment proof.");
    const intent = { businessId: customPackage.businessId.toString(), packageId: customPackage._id.toString(), ownerId: auth.id, assetType: input.assetType, originalName, contentType: input.mimeType, contentLength: input.size, checksumSha256: input.checksumSha256 };
    validatePaymentProofIntent(intent, readPositiveInteger(getEnvironment().MAX_IMAGE_SIZE_MB, 15));
    if (await Asset.exists({ ownerId: auth.id, assetType: "PAYMENT_PROOF", checksumSha256: input.checksumSha256.toLowerCase(), "metadata.packageId": customPackage._id.toString(), status: { $ne: "DELETED" } })) {
      throw new HttpError(409, "DUPLICATE_UPLOAD", "This payment proof has already been uploaded for the package.");
    }
    if (await Asset.exists({ ownerId: auth.id, assetType: "PAYMENT_PROOF", "metadata.packageId": customPackage._id.toString(), status: "PENDING_UPLOAD" })) throw new HttpError(409, "UPLOAD_IN_PROGRESS", "Finish or wait for the current payment-proof upload before starting another.");
    const key = buildPrivateObjectKey(intent);
    const asset = await Asset.create({ ownerId: auth.id, businessId: customPackage.businessId, assetType: "PAYMENT_PROOF", objectKey: key, originalName, mimeType: input.mimeType, size: input.size, checksumSha256: input.checksumSha256.toLowerCase(), metadata: { packageId: customPackage._id.toString() }, visibility: "PRIVATE", status: "PENDING_UPLOAD" });
    return ok({ assetId: asset._id.toString(), ...(await createSignedUpload(getR2Settings(), key, intent)) }, 201);
  }
  if (!input.productId) throw new HttpError(422, "PRODUCT_REQUIRED", "Choose a product for this upload.");
  const product = await requireOwnedProduct(input.productId, auth);
  if (!["UPLOADED", "CHANGES_REQUESTED"].includes(product.approvalStatus)) throw new HttpError(409, "PRODUCT_LOCKED", "Images can be changed only before submission or while an administrator-requested revision is open.");
  await enforceDatabaseRateLimit(`upload:${auth.id}`, 30, 15 * 60_000);
  if (!["ORIGINAL_IMAGE", "SUPPORTING_IMAGE"].includes(input.assetType)) throw new HttpError(422, "INVALID_ASSET_TYPE", "Customers may upload only original or supporting product images.");
  const storedAssetType: "ORIGINAL_IMAGE" | "SUPPORTING_IMAGE" = input.slot === "SUPPORTING" || input.assetType === "SUPPORTING_IMAGE" ? "SUPPORTING_IMAGE" : "ORIGINAL_IMAGE";
  const intent = { businessId: product.businessId.toString(), productId: product._id.toString(), ownerId: auth.id, assetType: storedAssetType, originalName, contentType: input.mimeType, contentLength: input.size, checksumSha256: input.checksumSha256 };
  validateImageIntent(intent, readPositiveInteger(getEnvironment().MAX_IMAGE_SIZE_MB, 15));
  if (await Asset.exists({ ownerId: auth.id, productId: product._id, checksumSha256: input.checksumSha256 })) throw new HttpError(409, "DUPLICATE_UPLOAD", "This image has already been uploaded for the product.");
  if (input.slot === "SUPPORTING") {
    const supporting = await Asset.countDocuments({ productId: product._id, assetType: "SUPPORTING_IMAGE", status: { $ne: "DELETED" } });
    if (supporting >= getDemoLimits().supportingImagesPerProduct) throw new HttpError(409, "SUPPORTING_IMAGE_LIMIT", "This product already has the maximum number of supporting images.");
  } else {
    const slot = input.slot ?? "MAIN";
    if (await Asset.exists({ productId: product._id, "metadata.slot": slot, status: "PENDING_UPLOAD" })) throw new HttpError(409, "UPLOAD_IN_PROGRESS", `Finish the current ${slot.toLowerCase()} image upload first.`);
    if (product.approvalStatus !== "CHANGES_REQUESTED" && await Asset.exists({ productId: product._id, "metadata.slot": slot, status: "VALIDATED" })) throw new HttpError(409, "IMAGE_SLOT_FILLED", `The ${slot.toLowerCase()} image slot is already filled.`);
  }
  const key = buildPrivateObjectKey(intent);
  const asset = await Asset.create({ ownerId: auth.id, businessId: product.businessId, productId: product._id, assetType: storedAssetType, objectKey: key, originalName: intent.originalName, mimeType: input.mimeType, size: input.size, checksumSha256: input.checksumSha256.toLowerCase(), metadata: { slot: input.slot ?? "MAIN" }, visibility: "PRIVATE", status: "PENDING_UPLOAD" });
  return ok({ assetId: asset._id.toString(), ...(await createSignedUpload(getR2Settings(), key, intent)) }, 201);
}

async function confirmUpload(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, uploadConfirmationSchema);
  const asset = await Asset.findOne({ _id: input.assetId, ownerId: auth.id, visibility: "PRIVATE", status: "PENDING_UPLOAD" });
  if (!asset || asset.checksumSha256 !== input.checksumSha256.toLowerCase()) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Pending upload not found.");
  const object = await confirmPrivateObject(getR2Settings(), asset.objectKey);
  const expectedChecksum = sha256HexToBase64(asset.checksumSha256);
  if (!object.contentLength || object.contentLength !== asset.size || object.contentType !== asset.mimeType || object.detectedContentType !== asset.mimeType || object.checksumSha256 !== expectedChecksum || object.calculatedChecksumSha256 !== expectedChecksum || object.metadata?.checksum !== asset.checksumSha256 || object.metadata?.owner !== auth.id) {
    asset.status = "REJECTED";
    await asset.save();
    throw new HttpError(422, "UPLOAD_MISMATCH", "The uploaded object did not match the authorized file.");
  }
  asset.status = "VALIDATED";
  asset.etag = object.etag;
  await asset.save();
  if (asset.assetType === "PAYMENT_PROOF") {
    const packageId = String(asset.metadata?.packageId ?? "");
    if (!packageId || !(await CustomPackage.exists({ _id: packageId, customerId: auth.id, businessId: asset.businessId, status: "ACCEPTED" }))) {
      asset.status = "REJECTED";
      await asset.save();
      throw new HttpError(409, "PACKAGE_NOT_ACCEPTED", "The package for this payment proof is no longer active.");
    }
    return ok({ assetId: asset._id.toString(), status: asset.status });
  }
  if (!asset.productId) throw new HttpError(409, "PRODUCT_REQUIRED", "The uploaded asset is not linked to a product.");
  const product = await requireOwnedProduct(asset.productId.toString(), auth);
  const slot = String(asset.metadata?.slot ?? "MAIN");
  const field: Record<string, string> = { MAIN: "mainImageAssetId", FRONT: "frontImageAssetId", BACK: "backImageAssetId", LEFT: "leftImageAssetId", RIGHT: "rightImageAssetId", TOP: "topImageAssetId" };
  if (slot === "SUPPORTING") product.supportingAssetIds.addToSet(asset._id);
  else {
    product.set(field[slot] ?? "mainImageAssetId", asset._id);
    await Asset.updateMany({ _id: { $ne: asset._id }, productId: product._id, "metadata.slot": slot, status: "VALIDATED" }, { $set: { status: "DELETED" } });
  }
  await product.save();
  return ok({ assetId: asset._id.toString(), status: asset.status });
}

async function createAdminReplacementIntent(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "THREE_D_REVIEWER", "AR_PUBLISHER"]);
  const input = await readJson(request, replacementUploadSchema);
  const product = await Product.findById(input.productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const submittedDemo = await DemoProject.findOne({ _id: product.demoProjectId, status: "READY_FOR_REVIEW" });
  if (!submittedDemo) throw new HttpError(409, "DEMO_NOT_SUBMITTED", "The complete demo must be submitted before products can be reviewed.");
  const intent = { businessId: product.businessId.toString(), productId: product._id.toString(), ownerId: auth.id, assetType: input.assetType, originalName: input.originalName.replace(/[\\/]/g, "_"), contentType: input.mimeType, contentLength: input.size, checksumSha256: input.checksumSha256 };
  validateReplacementIntent(intent, readPositiveInteger(getEnvironment().PRODUCTION_MODEL_TARGET_SIZE_MB, 25), readPositiveInteger(getEnvironment().MAX_IMAGE_SIZE_MB, 15));
  if (await Asset.exists({ ownerId: product.ownerId, productId: product._id, checksumSha256: input.checksumSha256.toLowerCase() })) throw new HttpError(409, "DUPLICATE_REPLACEMENT", "This replacement file is already stored for the product.");
  const key = buildPrivateObjectKey(intent);
  const asset = await Asset.create({ ownerId: product.ownerId, businessId: product.businessId, productId: product._id, assetType: input.assetType, objectKey: key, originalName: intent.originalName, mimeType: input.mimeType, size: input.size, checksumSha256: input.checksumSha256.toLowerCase(), visibility: "PRIVATE", status: "PENDING_UPLOAD", metadata: { replacement: true, uploadedByAdminId: auth.id } });
  return ok({ assetId: asset._id.toString(), ...(await createSignedUpload(getR2Settings(), key, intent)) }, 201);
}

async function confirmAdminReplacement(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "THREE_D_REVIEWER", "AR_PUBLISHER"]);
  const input = await readJson(request, uploadConfirmationSchema);
  const asset = await Asset.findOne({ _id: input.assetId, assetType: { $in: ["GLB_MODEL", "USDZ_MODEL", "THUMBNAIL"] }, status: "PENDING_UPLOAD", visibility: "PRIVATE", "metadata.replacement": true, "metadata.uploadedByAdminId": auth.id });
  if (!asset || asset.checksumSha256 !== input.checksumSha256.toLowerCase()) throw new HttpError(404, "REPLACEMENT_NOT_FOUND", "Pending replacement upload not found.");
  const object = await confirmPrivateObject(getR2Settings(), asset.objectKey);
  const expectedChecksum = sha256HexToBase64(asset.checksumSha256);
  if (!object.contentLength || object.contentLength !== asset.size || object.contentType !== asset.mimeType || object.detectedContentType !== asset.mimeType || object.checksumSha256 !== expectedChecksum || object.calculatedChecksumSha256 !== expectedChecksum || object.metadata?.checksum !== asset.checksumSha256 || object.metadata?.owner !== auth.id || object.metadata?.assettype !== asset.assetType) {
    asset.status = "REJECTED"; await asset.save();
    throw new HttpError(422, "REPLACEMENT_MISMATCH", "The replacement object did not match the authorized file.");
  }
  const latest = await Model3D.findOne({ productId: asset.productId }).sort({ version: -1 });
  if (!latest) { asset.status = "REJECTED"; await asset.save(); throw new HttpError(409, "MODEL_REQUIRED", "Generate a model before uploading replacement assets."); }
  asset.status = "VALIDATED"; asset.etag = object.etag; await asset.save();
  const model = await Model3D.create({ ownerId: latest.ownerId, businessId: latest.businessId, productId: latest.productId, jobId: latest.jobId, glbAssetId: asset.assetType === "GLB_MODEL" ? asset._id : latest.glbAssetId, usdzAssetId: asset.assetType === "USDZ_MODEL" ? asset._id : latest.usdzAssetId, thumbnailAssetId: asset.assetType === "THUMBNAIL" ? asset._id : latest.thumbnailAssetId, version: latest.version + 1, status: "NEEDS_MANUAL_REVIEW", fileSize: asset.assetType === "GLB_MODEL" ? asset.size : latest.fileSize, polygonCount: latest.polygonCount, validationWarnings: [...(latest.validationWarnings ?? []), `Administrator ${asset.assetType.toLowerCase().replaceAll("_", " ")} replacement requires review.`], technicallyValid: false, scale: latest.scale, orientation: latest.orientation });
  await Promise.all([Product.updateOne({ _id: asset.productId }, { $set: { approvalStatus: "NEEDS_MANUAL_REVIEW" } }), ArExperience.updateOne({ productId: asset.productId }, { $set: { modelId: model._id, updatedAt: new Date() } })]);
  await writeAudit({ actorId: auth.id, businessId: asset.businessId.toString(), action: "MODEL_ASSET_REPLACED", entityType: "Model3D", entityId: model._id.toString(), request, after: { assetType: asset.assetType, version: model.version } });
  return ok({ assetId: asset._id.toString(), modelId: model._id.toString(), version: model.version, status: model.status });
}

async function createJob(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, createJobSchema);
  const product = await requireOwnedProduct(input.productId, auth);
  if (!["UPLOADED", "CHANGES_REQUESTED"].includes(product.approvalStatus)) throw new HttpError(409, "PRODUCT_NOT_QUEUEABLE", "This product cannot be queued in its current review state.");
  const asset = await Asset.findOne({ _id: input.sourceAssetId, productId: product._id, ownerId: auth.id, status: "VALIDATED", assetType: { $in: ["ORIGINAL_IMAGE", "SUPPORTING_IMAGE"] } });
  if (!asset) throw new HttpError(409, "SOURCE_IMAGE_REQUIRED", "Upload and confirm a valid main image first.");
  if (product.approvalStatus === "CHANGES_REQUESTED") {
    const revision = await Approval.findOne({ productId: product._id, decision: { $in: ["REQUEST_BETTER_IMAGE", "REQUEST_MORE_IMAGES", "REQUEST_REGENERATION"] } }).sort({ createdAt: -1 });
    if (revision && revision.decision !== "REQUEST_REGENERATION" && asset.createdAt <= revision.createdAt) throw new HttpError(409, "NEW_SOURCE_IMAGE_REQUIRED", "Use an image uploaded after the administrator requested changes.");
  }
  const existing = await ThreeDJob.findOne({ productId: product._id }).sort({ createdAt: -1 });
  if (existing) {
    if (product.approvalStatus !== "CHANGES_REQUESTED" || existing.status !== "CHANGES_REQUESTED") throw new HttpError(409, "JOB_EXISTS", "This product already has a 3D generation job.");
    existing.sourceAssetId = asset._id; existing.status = "QUEUED"; existing.progress = 2; existing.currentStep = "Waiting for processing."; existing.attempts = 0; existing.availableAt = new Date(); existing.completedAt = undefined; existing.outputModelId = undefined; existing.errorCode = undefined; existing.customerSafeError = undefined; existing.internalTechnicalError = undefined; existing.workerId = undefined; existing.lockTimestamp = undefined; existing.leaseToken = undefined;
    await existing.save(); product.approvalStatus = "QUEUED"; product.version += 1; await product.save();
    return ok(existing);
  }
  const limits = getDemoLimits();
  const reserved = await Business.findOneAndUpdate({ _id: product.businessId, demoJobCount: { $lt: limits.threeDJobs } }, { $inc: { demoJobCount: 1 } }, { new: true });
  if (!reserved) throw new HttpError(409, "JOB_LIMIT_REACHED", `The demo includes up to ${limits.threeDJobs} 3D generation jobs.`);
  try {
    const job = await ThreeDJob.create({ ownerId: auth.id, businessId: product.businessId, productId: product._id, sourceAssetId: asset._id, status: "QUEUED", progress: 2, currentStep: "Waiting for processing." });
    product.approvalStatus = "QUEUED";
    await product.save();
    return ok(job, 201);
  } catch (error) {
    await Business.updateOne({ _id: product.businessId }, { $inc: { demoJobCount: -1 } });
    throw error;
  }
}

async function submitDemo(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const business = await requireOwnedBusiness(auth);
  const demo = await DemoProject.findOne({ businessId: business._id, ownerId: auth.id });
  if (!demo) throw new HttpError(404, "DEMO_NOT_FOUND", "Create a demo project first.");
  const products = await Product.find({ demoProjectId: demo._id });
  if (products.length === 0) throw new HttpError(409, "PRODUCT_REQUIRED", "Add at least one product before submitting your demo.");
  const incomplete = products.find((product) => !["READY_FOR_REVIEW", "NEEDS_MANUAL_REVIEW", "APPROVED_DEMO"].includes(product.approvalStatus));
  if (incomplete) throw new HttpError(409, "PRODUCT_NOT_READY", `${incomplete.name} is not ready for administrator review.`);
  demo.status = "READY_FOR_REVIEW";
  demo.submittedAt = new Date();
  await demo.save();
  return ok({ demoProjectId: demo._id.toString(), status: demo.status });
}

async function reviewProduct(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER"]);
  const input = await readJson(request, reviewSchema);
  const product = await Product.findById(input.productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  if (!(await DemoProject.exists({ _id: product.demoProjectId, status: "READY_FOR_REVIEW" }))) throw new HttpError(409, "DEMO_NOT_SUBMITTED", "The complete demo must be submitted before products can be reviewed.");
  if (!["READY_FOR_REVIEW", "NEEDS_MANUAL_REVIEW"].includes(product.approvalStatus)) throw new HttpError(409, "PRODUCT_NOT_REVIEWABLE", "This product is not currently awaiting review.");
  const latestModel = await Model3D.findOne({ productId: product._id }).sort({ version: -1 });
  const modelVersionChanged = latestModel ? input.expectedModelVersion !== latestModel.version : input.expectedModelVersion !== undefined;
  if (product.version !== input.expectedProductVersion || modelVersionChanged) throw new HttpError(409, "REVIEW_VERSION_CHANGED", "The product or model changed after this review screen loaded. Reload before deciding.");
  if (input.decision === "APPROVE_PRODUCT" && !latestModel) throw new HttpError(409, "MODEL_NOT_READY", "A valid model is required before product approval.");
  const mapping = { APPROVE_PRODUCT: "APPROVED_DEMO", REJECT_PRODUCT: "REJECTED", REQUEST_BETTER_IMAGE: "CHANGES_REQUESTED", REQUEST_MORE_IMAGES: "CHANGES_REQUESTED", REQUEST_REGENERATION: "CHANGES_REQUESTED" } as const;
  const transitioned = await Product.updateOne({ _id: product._id, version: input.expectedProductVersion, approvalStatus: { $in: ["READY_FOR_REVIEW", "NEEDS_MANUAL_REVIEW"] } }, { $set: { approvalStatus: mapping[input.decision] } });
  if (transitioned.modifiedCount !== 1) throw new HttpError(409, "REVIEW_CONFLICT", "Another administrator or process changed this product. Reload before deciding.");
  product.approvalStatus = mapping[input.decision];
  if (input.decision.startsWith("REQUEST_")) {
    const reviewedJob = await ThreeDJob.findOne({ productId: product._id }).sort({ createdAt: -1 });
    if (reviewedJob) { reviewedJob.status = "CHANGES_REQUESTED"; reviewedJob.progress = 100; reviewedJob.currentStep = "Administrator requested changes before approval."; await reviewedJob.save(); }
  }
  if (input.decision === "REJECT_PRODUCT") await DemoProject.updateOne({ _id: product.demoProjectId }, { $set: { status: "REJECTED" } });
  await Approval.create({ ownerId: product.ownerId, businessId: product.businessId, demoProjectId: product.demoProjectId, productId: product._id, reviewerId: auth.id, decision: input.decision, customerFeedback: input.customerFeedback, internalNotes: input.internalNotes, productVersion: input.expectedProductVersion, modelVersion: latestModel?.version });
  if (latestModel) { latestModel.status = mapping[input.decision]; await latestModel.save(); }
  if (input.decision === "APPROVE_PRODUCT") { const { ar } = await ensureDraftExperience(product._id.toString()); ar.status = "APPROVED_DEMO"; await ar.save(); }
  else await ArExperience.updateOne({ productId: product._id }, { $set: { status: mapping[input.decision] } });
  const remaining = await Product.countDocuments({ demoProjectId: product.demoProjectId, approvalStatus: { $ne: "APPROVED_DEMO" } });
  if (remaining === 0) {
    await DemoProject.updateOne({ _id: product.demoProjectId }, { $set: { status: "APPROVED_DEMO", approvedAt: new Date() } });
    await Notification.create({ userId: product.ownerId, businessId: product.businessId, type: "DEMO_APPROVED", title: "Your demo is approved", message: "All submitted products are approved. B Socio can now prepare your custom package." });
  }
  await writeAudit({ actorId: auth.id, businessId: product.businessId.toString(), action: input.decision, entityType: "Product", entityId: product._id.toString(), request, after: { status: product.approvalStatus } });
  return ok({ productId: product._id.toString(), status: product.approvalStatus, allProductsApproved: remaining === 0 });
}

async function resubmitProduct(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const { productId } = await readJson(request, productResubmitSchema);
  const product = await requireOwnedProduct(productId, auth);
  if (product.approvalStatus !== "CHANGES_REQUESTED") throw new HttpError(409, "CHANGES_NOT_REQUESTED", "This product is not waiting for a revision.");
  const approval = await Approval.findOne({ productId: product._id, decision: { $in: ["REQUEST_BETTER_IMAGE", "REQUEST_MORE_IMAGES", "REQUEST_REGENERATION"] } }).sort({ createdAt: -1 });
  if (!approval) throw new HttpError(409, "REVISION_REQUEST_NOT_FOUND", "The administrator revision request is unavailable.");
  if (approval.decision === "REQUEST_REGENERATION") {
    const regenerated = await ThreeDJob.exists({ productId: product._id, status: { $in: ["READY_FOR_REVIEW", "NEEDS_MANUAL_REVIEW"] }, completedAt: { $gt: approval.createdAt } });
    if (!regenerated) throw new HttpError(409, "REGENERATION_REQUIRED", "Queue and complete a new 3D generation before resubmitting.");
  } else {
    const newImage = await Asset.exists({ productId: product._id, ownerId: auth.id, assetType: { $in: ["ORIGINAL_IMAGE", "SUPPORTING_IMAGE"] }, status: "VALIDATED", createdAt: { $gt: approval.createdAt } });
    if (!newImage) throw new HttpError(409, "NEW_IMAGE_REQUIRED", "Upload the requested new image before resubmitting.");
  }
  product.approvalStatus = "READY_FOR_REVIEW"; product.version += 1; await product.save();
  await DemoProject.updateOne({ _id: product.demoProjectId, status: { $in: ["READY_FOR_REVIEW", "CHANGES_REQUESTED"] } }, { $set: { status: "READY_FOR_REVIEW", submittedAt: new Date() } });
  await Notification.create({ userId: product.ownerId, businessId: product.businessId, type: "PRODUCT_RESUBMITTED", title: `${product.name} was resubmitted`, message: "Your revised product is back in the administrator review queue." });
  return ok({ productId: product._id.toString(), status: product.approvalStatus });
}

async function createPackage(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER"]);
  const input = await readJson(request, packageSchema);
  const [demo, business] = await Promise.all([
    DemoProject.findOne({ _id: input.demoProjectId, businessId: input.businessId, status: "APPROVED_DEMO" }),
    Business.findById(input.businessId),
  ]);
  if (!demo || !business) throw new HttpError(409, "DEMO_NOT_APPROVED", "Approve the complete demo before creating a package.");
  if (business.ownerId.toString() !== input.customerId || demo.ownerId.toString() !== input.customerId) {
    throw new HttpError(422, "CUSTOMER_MISMATCH", "The customer, business and demo must belong to the same account.");
  }
  const customPackage = await CustomPackage.create({ ...input, status: "OFFERED" });
  await DemoProject.updateOne({ _id: demo._id }, { $set: { status: "AWAITING_PACKAGE" } });
  await Notification.create({ userId: input.customerId, businessId: input.businessId, type: "PACKAGE_OFFERED", title: "Your custom package is ready", message: "Review and accept your tailored B Socio AR package." });
  await writeAudit({ actorId: auth.id, businessId: input.businessId, action: "PACKAGE_CREATED", entityType: "CustomPackage", entityId: customPackage._id.toString(), request });
  return ok(customPackage, 201);
}

async function acceptPackage(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, packageAcceptSchema);
  const customPackage = await CustomPackage.findOne({ _id: input.packageId, customerId: auth.id, status: "OFFERED", expiresAt: { $gt: new Date() } });
  if (!customPackage) throw new HttpError(404, "PACKAGE_NOT_AVAILABLE", "This package is unavailable or expired.");
  customPackage.status = "ACCEPTED";
  customPackage.acceptedAt = new Date();
  await customPackage.save();
  await DemoProject.updateOne({ _id: customPackage.demoProjectId }, { $set: { status: "AWAITING_PAYMENT" } });
  return ok({ packageId: customPackage._id.toString(), status: customPackage.status });
}

async function submitPayment(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, paymentSubmissionSchema);
  const database = await dbConnect();
  const session = await database.startSession();
  let paymentId: string | undefined;
  try {
    await session.withTransaction(async () => {
      const customPackage = await CustomPackage.findOne({ _id: input.packageId, customerId: auth.id, status: "ACCEPTED" }).session(session);
      if (!customPackage) throw new HttpError(409, "PACKAGE_NOT_ACCEPTED", "Accept the active package before submitting payment.");
      const proof = await Asset.findOne({ _id: input.proofAssetId, ownerId: auth.id, businessId: customPackage.businessId, assetType: "PAYMENT_PROOF", status: "VALIDATED", visibility: "PRIVATE", paymentId: { $exists: false }, "metadata.packageId": customPackage._id.toString() }).session(session);
      if (!proof) throw new HttpError(409, "PAYMENT_PROOF_REQUIRED", "Upload valid unused payment proof before submitting.");
      let payment = await Payment.findOne({ packageId: customPackage._id }).session(session);
      if (payment && ["SUBMITTED", "VERIFIED"].includes(payment.status)) throw new HttpError(409, "PAYMENT_ALREADY_SUBMITTED", "A payment for this package is already awaiting or has completed verification.");
      if (payment) {
        payment.set({ method: input.method, transactionReference: input.transactionReference, proofAssetId: proof._id, customerNotes: input.customerNotes, status: "SUBMITTED", adminNotes: undefined, reviewedBy: undefined, reviewedAt: undefined });
        await payment.save({ session });
      } else {
        [payment] = await Payment.create([{ customerId: auth.id, businessId: customPackage.businessId, ...input, status: "SUBMITTED" }], { session });
      }
      const attached = await Asset.updateOne({ _id: proof._id, paymentId: { $exists: false } }, { $set: { paymentId: payment._id } }, { session });
      if (attached.modifiedCount !== 1) throw new HttpError(409, "PAYMENT_PROOF_ALREADY_USED", "This payment proof is already attached to another submission.");
      paymentId = payment._id.toString();
    });
  } finally { await session.endSession(); }
  const payment = paymentId ? await Payment.findById(paymentId) : null;
  if (!payment) throw new HttpError(500, "PAYMENT_TRANSACTION_FAILED", "The payment submission could not be committed.");
  return ok(payment, 201);
}

async function reviewPayment(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]);
  const input = await readJson(request, paymentReviewSchema);
  const database = await dbConnect();
  const session = await database.startSession();
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        { _id: input.paymentId, status: { $in: ["SUBMITTED", "CLARIFICATION_REQUESTED"] } },
        { $set: { status: input.decision, adminNotes: input.adminNotes, reviewedBy: auth.id, reviewedAt: new Date() } },
        { new: true, session },
      );
      if (!payment) throw new HttpError(409, "PAYMENT_NOT_REVIEWABLE", "This payment is unavailable or its review is already final.");
      if (input.decision === "VERIFIED") {
        const customPackage = await CustomPackage.findById(payment.packageId).session(session);
        if (!customPackage) throw new HttpError(409, "PACKAGE_NOT_FOUND", "The payment package is unavailable.");
        await DemoProject.updateOne({ _id: customPackage.demoProjectId }, { $set: { status: "PRODUCTION_APPROVED" } }, { session });
        const approved = await Product.find({ demoProjectId: customPackage.demoProjectId, approvalStatus: "APPROVED_DEMO" }).select("_id").session(session).lean();
        await ArExperience.updateMany({ productId: { $in: approved.map((product) => product._id) } }, { $set: { status: "PRODUCTION_APPROVED" } }, { session });
      }
    });
  } finally { await session.endSession(); }
  const payment = await Payment.findById(input.paymentId);
  if (!payment) throw new HttpError(409, "PAYMENT_NOT_REVIEWABLE", "This payment is unavailable or its review is already final.");
  await writeAudit({ actorId: auth.id, businessId: payment.businessId.toString(), action: `PAYMENT_${input.decision}`, entityType: "Payment", entityId: payment._id.toString(), request });
  return ok({ paymentId: payment._id.toString(), status: payment.status });
}

async function publishProduct(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "AR_PUBLISHER"]);
  const { productId } = await readJson(request, publishSchema);
  const product = await Product.findOne({ _id: productId, approvalStatus: { $in: ["APPROVED_DEMO", "PRODUCTION_APPROVED"] } });
  if (!product) throw new HttpError(409, "PRODUCT_NOT_APPROVED", "Approve the product before publishing.");
  const billing = await canCreateLocationRequest(product.businessId.toString());
  if (!billing.allowed) {
    throw new HttpError(
      409,
      billing.reason ?? "SUBSCRIPTION_RESTRICTED",
      billing.reason === "REQUEST_LIMIT_REACHED"
        ? "Monthly request limit reached. The company must upgrade or contact support before another secure link is generated."
        : "The company subscription does not currently allow a new secure link.",
    );
  }
  const paidPackage = await CustomPackage.findOne({ businessId: product.businessId, demoProjectId: product.demoProjectId, status: "ACCEPTED" });
  if (!paidPackage || !(await Payment.exists({ businessId: product.businessId, packageId: paidPackage._id, status: "VERIFIED" }))) throw new HttpError(409, "PAYMENT_NOT_VERIFIED", "Verify this demo's accepted package payment before publishing live AR.");
  const { ar, qr, model } = await ensureDraftExperience(product._id.toString());
  if (model.status !== "APPROVED_DEMO") throw new HttpError(409, "MODEL_NOT_APPROVED", "The latest model version must be explicitly approved before publication.");
  const asset = await Asset.findById(model.glbAssetId);
  const usdzAsset = model.usdzAssetId ? await Asset.findById(model.usdzAssetId) : null;
  const business = await Business.findById(product.businessId);
  if (!asset || !business) throw new HttpError(409, "PUBLISH_ASSET_MISSING", "The approved model asset is unavailable.");
  const publicKey = `published/${business.slug}/${product.slug}/model-v${model.version}.glb`;
  await publishApprovedObject(getR2Settings(), asset.objectKey, publicKey);
  asset.visibility = "PUBLIC_APPROVED";
  asset.metadata = { ...(asset.metadata ?? {}), publicKey };
  await asset.save();
  if (usdzAsset) {
    const usdzPublicKey = `published/${business.slug}/${product.slug}/model-v${model.version}.usdz`;
    await publishApprovedObject(getR2Settings(), usdzAsset.objectKey, usdzPublicKey);
    usdzAsset.visibility = "PUBLIC_APPROVED";
    usdzAsset.metadata = { ...(usdzAsset.metadata ?? {}), publicKey: usdzPublicKey };
    await usdzAsset.save();
  }
  ar.status = "PUBLISHED";
  ar.publicSlug = `${business.slug}/${product.slug}`;
  ar.modelScale = product.scale ?? 1;
  ar.cameraOrbit = product.cameraOrbit;
  ar.publishedAt = new Date();
  await ar.save();
  qr.active = true;
  qr.destinationPath = `/ar/${business.slug}/${product.slug}`;
  await qr.save();
  product.approvalStatus = "PUBLISHED";
  await product.save();
  model.status = "PUBLISHED";
  await model.save();
  await consumeLocationRequest(
    product.businessId.toString(),
    `secure-link:${product._id.toString()}:v${model.version}`,
    { productId: product._id.toString(), arExperienceId: ar._id.toString(), qrCodeId: qr._id.toString() },
  );
  await writeAudit({ actorId: auth.id, businessId: product.businessId.toString(), action: "AR_PUBLISHED", entityType: "ArExperience", entityId: ar._id.toString(), request });
  return ok({ arPath: qr.destinationPath, qrPath: `/q/product/${qr.uniqueCode}`, status: "PUBLISHED" });
}

async function updateProductByAdmin(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER", "AR_PUBLISHER"]);
  const input = await readJson(request, adminProductUpdateSchema);
  const product = await Product.findById(input.productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  if (["APPROVED_DEMO", "PRODUCTION_APPROVED", "PUBLISHED", "REJECTED", "CANCELLED"].includes(product.approvalStatus)) throw new HttpError(409, "PRODUCT_LOCKED", "Approved, published or closed product versions cannot be edited. Reopen the review workflow before changing them.");
  if ((input.price === null) !== (input.currency === null) || (input.price !== undefined && input.currency === undefined) || (input.currency !== undefined && input.price === undefined)) throw new HttpError(422, "PRICE_CURRENCY_PAIR", "Price and currency must be updated or cleared together.");
  const before = { name: product.name, description: product.description, category: product.category, dimensions: product.dimensions, material: product.material, colour: product.colour, price: product.price, currency: product.currency, scale: product.scale, cameraOrbit: product.cameraOrbit };
  for (const key of ["name", "description", "category", "dimensions", "material", "colour", "scale"] as const) if (input[key] !== undefined) product.set(key, input[key]);
  if (input.price === null) { product.price = undefined; product.currency = undefined; }
  else if (input.price !== undefined && input.currency) { product.price = input.price; product.currency = input.currency; }
  if (input.cameraOrbit === null) product.cameraOrbit = undefined;
  else if (input.cameraOrbit !== undefined) product.cameraOrbit = input.cameraOrbit;
  product.version += 1;
  await product.save();
  await writeAudit({ actorId: auth.id, businessId: product.businessId.toString(), action: "PRODUCT_UPDATED_BY_ADMIN", entityType: "Product", entityId: product._id.toString(), request, before, after: input });
  return ok({ productId: product._id.toString(), version: product.version });
}

async function createTeamMember(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN"]);
  const input = await readJson(request, teamMemberSchema);
  if (await User.exists({ email: input.email })) throw new HttpError(409, "EMAIL_EXISTS", "An account already uses this email address.");
  const member = await User.create({ fullName: input.fullName, email: input.email, passwordHash: await hashPassword(input.password), role: input.role, country: "Configured", countryCallingCode: "+1", mobileNumber: "000000", emailVerifiedAt: new Date(), sessionVersion: 1 });
  await writeAudit({ actorId: auth.id, action: "TEAM_MEMBER_CREATED", entityType: "User", entityId: member._id.toString(), request, after: { email: member.email, role: member.role } });
  return ok({ id: member._id.toString(), fullName: member.fullName, email: member.email, role: member.role }, 201);
}

async function changeCustomerAccount(request: NextRequest) {
  const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER"]);
  const input = await readJson(request, customerAccountActionSchema);
  const customer = await User.findOne({ _id: input.userId, role: "CUSTOMER" });
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "Customer account not found.");
  const wasSuspended = Boolean(customer.suspendedAt);
  if (input.action === "SUSPEND") { customer.suspendedAt = new Date(); customer.suspensionReason = input.reason; }
  else { customer.suspendedAt = undefined; customer.suspensionReason = undefined; }
  customer.sessionVersion += 1;
  await customer.save();
  await Business.updateOne({ ownerId: customer._id }, { $set: { status: input.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE" } });
  await writeAudit({ actorId: auth.id, businessId: customer.businessId?.toString(), action: `CUSTOMER_${input.action}`, entityType: "User", entityId: customer._id.toString(), request, before: { suspended: wasSuspended }, after: { suspended: input.action === "SUSPEND", reason: input.reason } });
  return ok({ userId: customer._id.toString(), suspended: input.action === "SUSPEND" });
}

async function updateQrCode(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const input = await readJson(request, qrUpdateSchema);
  const product = await requireOwnedProduct(input.productId, auth);
  const [qr, business] = await Promise.all([QrCode.findOne({ productId: product._id, ownerId: auth.id }), Business.findById(product.businessId)]);
  if (!qr || !business) throw new HttpError(404, "QR_NOT_FOUND", "Dynamic QR code not found.");
  let canonicalDestination = qr.destinationPath;
  let targetArId = qr.arExperienceId;
  if (qr.active || input.destinationPath !== qr.destinationPath) {
    const segments = input.destinationPath.split("/");
    if (segments.length !== 4 || segments[0] !== "" || segments[1] !== "ar" || segments[2] !== business.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[3] ?? "")) throw new HttpError(422, "QR_DESTINATION_INVALID", "Choose a canonical published AR path inside your own B Socio AR business.");
    const targetProduct = await Product.findOne({ businessId: business._id, slug: segments[3] });
    const targetAr = targetProduct ? await ArExperience.findOne({ productId: targetProduct._id, businessId: business._id, status: "PUBLISHED", publicSlug: `${business.slug}/${targetProduct.slug}` }) : null;
    if (!targetProduct || !targetAr) throw new HttpError(409, "QR_TARGET_NOT_PUBLISHED", "The QR destination must be one of your published AR experiences.");
    canonicalDestination = `/ar/${business.slug}/${targetProduct.slug}`;
    targetArId = targetAr._id;
  }
  const before = { destinationPath: qr.destinationPath, foreground: qr.foreground, background: qr.background, errorCorrectionLevel: qr.errorCorrectionLevel, size: qr.size, callToAction: qr.callToAction };
  qr.set({ ...input, destinationPath: canonicalDestination, arExperienceId: targetArId }); await qr.save();
  await writeAudit({ actorId: auth.id, businessId: product.businessId.toString(), action: "QR_UPDATED", entityType: "QrCode", entityId: qr._id.toString(), request, before, after: input });
  return ok({ qrCodeId: qr._id.toString(), destinationPath: qr.destinationPath, active: qr.active });
}

async function getPublicAr(businessSlug: string, productSlug: string, request: NextRequest) {
  await dbConnect();
  const business = await Business.findOne({ slug: businessSlug, status: "ACTIVE" });
  if (!business) throw new HttpError(404, "AR_NOT_FOUND", "AR experience not found.");
  const product = await Product.findOne({ businessId: business._id, slug: productSlug });
  if (!product) throw new HttpError(404, "AR_NOT_FOUND", "AR experience not found.");
  const [ar, commerceProfile] = await Promise.all([
    ArExperience.findOne({ productId: product._id, status: "PUBLISHED" }),
    CommerceProductProfile.findOne({ productId: product._id, businessId: business._id }),
  ]);
  if (!ar) throw new HttpError(404, "AR_NOT_PUBLISHED", "This AR experience is not published.");
  const model = await Model3D.findById(ar.modelId);
  const glbAsset = model ? await Asset.findById(model.glbAssetId) : null;
  const usdzAsset = model?.usdzAssetId ? await Asset.findById(model.usdzAssetId) : null;
  if (!model || !glbAsset) throw new HttpError(404, "MODEL_NOT_FOUND", "Published model not found.");
  const publicKey = typeof glbAsset.metadata?.publicKey === "string" ? glbAsset.metadata.publicKey : undefined;
  const env = getEnvironment();
  const modelUrl = publicKey && env.R2_PUBLIC_DOMAIN ? `${env.R2_PUBLIC_DOMAIN.replace(/\/$/, "")}/${publicKey}` : await createSignedPrivateDownload(getR2Settings(), glbAsset.objectKey);
  const usdzPublicKey = typeof usdzAsset?.metadata?.publicKey === "string" ? usdzAsset.metadata.publicKey : undefined;
  const usdzUrl = usdzAsset ? (usdzPublicKey && env.R2_PUBLIC_DOMAIN ? `${env.R2_PUBLIC_DOMAIN.replace(/\/$/, "")}/${usdzPublicKey}` : await createSignedPrivateDownload(getR2Settings(), usdzAsset.objectKey)) : undefined;
  try {
    await Promise.all([
      ArExperience.updateOne({ _id: ar._id }, { $inc: { opens: 1 } }),
      AnalyticsEvent.create({ businessId: business._id, productId: product._id, arExperienceId: ar._id, eventType: "AR_OPEN", deviceType: request.headers.get("user-agent")?.slice(0, 200), referrer: request.headers.get("referer")?.slice(0, 500) }),
      ...(commerceProfile?.kind === "RESTAURANT" ? [
        AnalyticsEvent.create({ businessId: business._id, productId: product._id, arExperienceId: ar._id, eventType: "PRODUCT_VIEW" }),
        AnalyticsEvent.create({ businessId: business._id, productId: product._id, arExperienceId: ar._id, eventType: "THREE_D_VIEW" }),
      ] : commerceProfile?.kind === "JEWELLERY" ? [
        AnalyticsEvent.create({ businessId: business._id, productId: product._id, arExperienceId: ar._id, eventType: "PRODUCT_VIEW" }),
      ] : []),
    ]);
  } catch (error) { console.error("Published AR analytics write failed", error); }
  const diningContext = commerceProfile?.kind === "RESTAURANT"
    ? await optionalDiningSession(request, business._id.toString())
    : null;
  const jewellerySettings = (commerceProfile?.kind === "JEWELLERY"
    ? await JewellerySettings.findOne({ businessId: business._id }).select("branchNumbers").lean()
    : null) as { branchNumbers?: Array<{ branchId?: string; branchName?: string }> } | null;
  return ok({
    business: { name: business.name, slug: business.slug, category: business.category, primaryColour: business.primaryColour, website: business.website },
    product: { id: product._id.toString(), name: product.name, slug: product.slug, description: product.description, category: product.category, dimensions: product.dimensions, material: product.material, colour: product.colour, price: product.price, currency: product.currency },
    ar: { title: ar.title, description: ar.description, price: ar.price, currency: ar.currency, whatsappUrl: ar.whatsappUrl, websiteUrl: ar.websiteUrl, instagramUrl: ar.instagramUrl, contactUrl: ar.contactUrl },
    model: { id: model._id.toString(), url: modelUrl, usdzUrl, fileSize: model.fileSize, hasUsdz: Boolean(usdzUrl), scale: ar.modelScale ?? 1, cameraOrbit: ar.cameraOrbit },
    commerce: commerceProfile ? {
      kind: commerceProfile.kind,
      menuCategory: commerceProfile.menuCategory,
      servingInformation: commerceProfile.servingInformation,
      approximateServingSize: commerceProfile.approximateServingSize,
      sku: commerceProfile.sku,
      jewelleryCategory: commerceProfile.jewelleryCategory,
      metalType: commerceProfile.metalType,
      stoneType: commerceProfile.stoneType,
      productSize: commerceProfile.productSize,
      variants: commerceProfile.variants ?? [],
      branches: jewellerySettings?.branchNumbers?.flatMap((branch) => branch.branchId ? [{
        branchId: branch.branchId,
        branchName: branch.branchName || branch.branchId,
      }] : []) ?? [],
      tryOnEnabled: commerceProfile.tryOnEnabled !== false,
    } : null,
    diningSession: diningContext ? {
      active: true,
      table: { id: diningContext.table._id.toString(), number: diningContext.table.tableNumber, name: diningContext.table.tableName },
    } : { active: false, table: null },
  });
}

async function getRoute(request: NextRequest, path: string) {
  const billingResponse = await handleBillingGet(request, path);
  if (billingResponse) return billingResponse;
  const commerceResponse = await handleCommerceGet(request, path);
  if (commerceResponse) return commerceResponse;
  if (path === "auth/session") return ok({ user: await requireAuth(request) });
  if (path === "account") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    const user = await User.findById(auth.id).select("fullName email country countryCallingCode mobileNumber locale timeZone emailVerifiedAt lastLoginAt createdAt").lean();
    if (!user) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account not found.");
    return ok({ user });
  }
  if (path === "support") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ items: await SupportTicket.find({ ownerId: auth.id }).select("subject category description status priority adminResponse resolvedAt createdAt updatedAt").sort({ updatedAt: -1 }).limit(100).lean() });
  }
  if (path === "business") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ business: await Business.findOne(ownerFilter(auth)).lean() });
  }
  if (path === "demo") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ demo: await DemoProject.findOne(ownerFilter(auth)).lean() });
  }
  if (path === "products") {
    const auth = await requireAuth(request);
    if (auth.isAdmin) requireRole(auth, PRODUCT_REVIEW_ROLES);
    const { page, pageSize, skip } = pagination(request);
    const filter = ownerFilter(auth);
    const [items, total] = await Promise.all([Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), Product.countDocuments(filter)]);
    return ok({ items, total, page, pageSize, limit: getDemoLimits().products });
  }
  if (path.startsWith("products/")) {
    const auth = await requireAuth(request);
    if (auth.isAdmin) requireRole(auth, PRODUCT_REVIEW_ROLES);
    const product = await requireOwnedProduct(path.split("/")[1] ?? "", auth);
    const [assets, jobs, models3d, ar, qr, approvals] = await Promise.all([
      Asset.find({ productId: product._id, status: { $ne: "DELETED" } }).select("assetType originalName mimeType size width height visibility status metadata createdAt updatedAt").lean(),
      ThreeDJob.find({ productId: product._id }).sort({ createdAt: -1 }).lean(),
      Model3D.find({ productId: product._id }).sort({ version: -1 }).lean(),
      ArExperience.findOne({ productId: product._id }).lean(),
      QrCode.findOne({ productId: product._id }).lean(),
      Approval.find({ productId: product._id }).select(auth.isAdmin ? "" : "decision customerFeedback productVersion modelVersion createdAt").sort({ createdAt: -1 }).lean(),
    ]);
    return ok({ product, assets, jobs, models: models3d, ar, qr, approvals });
  }
  if (path === "jobs") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ items: await ThreeDJob.find(ownerFilter(auth)).sort({ createdAt: -1 }).limit(50).lean() });
  }
  if (path === "uploads") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ items: await Asset.find({ ...ownerFilter(auth), status: { $ne: "DELETED" }, assetType: { $ne: "PAYMENT_PROOF" } }).select("productId assetType originalName mimeType size width height visibility status metadata createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
  }
  if (path === "models") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    const items = await Model3D.find(ownerFilter(auth)).select("productId version status fileSize polygonCount validationWarnings technicallyValid scale createdAt updatedAt").sort({ createdAt: -1 }).limit(50).lean();
    const products = await Product.find({ _id: { $in: items.map((item) => item.productId) }, ownerId: auth.id }).select("name").lean();
    const names = new Map(products.map((product) => [String(product._id), product.name]));
    return ok({ items: items.map((item) => ({ ...item, productName: names.get(String(item.productId)) ?? "Product" })) });
  }
  if (path === "ar-experiences") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ items: await ArExperience.find(ownerFilter(auth)).select("productId title description draftSlug publicSlug status price currency opens publishedAt createdAt updatedAt").sort({ createdAt: -1 }).limit(50).lean() });
  }
  if (path === "qr-codes") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ items: await QrCode.find(ownerFilter(auth)).select("productId uniqueCode destinationPath foreground background errorCorrectionLevel size callToAction scans active createdAt updatedAt").sort({ createdAt: -1 }).limit(50).lean() });
  }
  if (path === "approvals") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    return ok({ items: await Approval.find(ownerFilter(auth)).select("productId decision customerFeedback productVersion modelVersion createdAt").sort({ createdAt: -1 }).limit(100).lean() });
  }
  if (path === "analytics") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    const business = await requireOwnedBusiness(auth);
    const [qrScans, arOpens, recent] = await Promise.all([
      AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "QR_SCAN" }),
      AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "AR_OPEN" }),
      AnalyticsEvent.find({ businessId: business._id }).select("productId eventType occurredAt").sort({ occurredAt: -1 }).limit(50).lean(),
    ]);
    return ok({ summary: { qrScans, arOpens }, items: recent });
  }
  if (path.match(/^models\/[a-f\d]{24}\/signed-url$/i)) {
    const auth = await requireAuth(request);
    if (auth.isAdmin) requireRole(auth, ["SUPER_ADMIN", "ADMIN", "THREE_D_REVIEWER", "AR_PUBLISHER"]);
    const model = await Model3D.findOne({ _id: path.split("/")[1], ...ownerFilter(auth) });
    if (!model) throw new HttpError(404, "MODEL_NOT_FOUND", "Model not found.");
    const asset = await Asset.findById(model.glbAssetId);
    if (!asset) throw new HttpError(404, "MODEL_ASSET_NOT_FOUND", "Model asset not found.");
    const product = await Product.findById(model.productId).select("scale cameraOrbit");
    return ok({ url: await createSignedPrivateDownload(getR2Settings(), asset.objectKey), expiresIn: getR2Settings().signedUrlTtlSeconds, model, presentation: { scale: product?.scale ?? 1, cameraOrbit: product?.cameraOrbit } });
  }
  if (path.match(/^assets\/[a-f\d]{24}\/signed-url$/i)) {
    const auth = await requireAuth(request);
    if (auth.isAdmin && !["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER", "AR_PUBLISHER"].includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "You do not have permission to preview product assets.");
    const asset = await Asset.findById(path.split("/")[1]);
    if (!asset || asset.assetType === "PAYMENT_PROOF" || !asset.productId || asset.status !== "VALIDATED") throw new HttpError(404, "ASSET_NOT_FOUND", "Private product asset not found.");
    await requireOwnedProduct(asset.productId.toString(), auth);
    return ok({ url: await createSignedPrivateDownload(getR2Settings(), asset.objectKey), expiresIn: getR2Settings().signedUrlTtlSeconds, mimeType: asset.mimeType, originalName: asset.originalName });
  }
  if (path === "dashboard") {
    const auth = await requireAuth(request, ["CUSTOMER"]);
    const business = await requireOwnedBusiness(auth);
    const activeStatuses = ["LOCKED", "VALIDATING_IMAGE", "PROCESSING_BACKGROUND", "LOADING_MODEL", "GENERATING_MESH", "BAKING_TEXTURE", "CONVERTING_GLB", "OPTIMISING_MODEL", "GENERATING_THUMBNAIL", "UPLOADING_RESULTS"];
    const [productsUsed, jobsQueued, currentJob, modelsReady, changesRequested, approvedProducts, arExperiences, qrCodes, scans, customPackage] = await Promise.all([
      Product.countDocuments({ businessId: business._id }), ThreeDJob.countDocuments({ businessId: business._id, status: "QUEUED" }),
      ThreeDJob.findOne({ businessId: business._id, status: { $in: activeStatuses } }).lean(),
      Model3D.countDocuments({ businessId: business._id, status: { $in: ["READY_FOR_REVIEW", "APPROVED_DEMO", "PUBLISHED"] } }),
      Product.countDocuments({ businessId: business._id, approvalStatus: "CHANGES_REQUESTED" }),
      Product.countDocuments({ businessId: business._id, approvalStatus: { $in: ["APPROVED_DEMO", "PRODUCTION_APPROVED", "PUBLISHED"] } }),
      ArExperience.countDocuments({ businessId: business._id }), QrCode.countDocuments({ businessId: business._id }),
      QrCode.aggregate([{ $match: { businessId: business._id } }, { $group: { _id: null, total: { $sum: "$scans" } } }]),
      CustomPackage.findOne({ businessId: business._id }).sort({ createdAt: -1 }),
    ]);
    return ok({ productsUsed, productLimit: getDemoLimits().products, jobsQueued, currentJob, modelsReady, changesRequested, approvedProducts, arExperiences, qrCodes, scans: scans[0]?.total ?? 0, packageStatus: customPackage?.status });
  }
  if (path === "packages") {
    const auth = await requireAuth(request);
    if (auth.isAdmin && !["SUPER_ADMIN", "ADMIN", "SALES_MANAGER"].includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "You do not have permission to view commercial packages.");
    const query = CustomPackage.find(auth.isAdmin ? {} : { customerId: auth.id });
    if (!auth.isAdmin) query.select("-internalNotes");
    return ok({ items: await query.sort({ createdAt: -1 }).limit(100).lean() });
  }
  if (path === "payments") {
    const auth = await requireAuth(request);
    if (auth.isAdmin && !["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"].includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "You do not have permission to view payments.");
    return ok({ items: await Payment.find(auth.isAdmin ? {} : { customerId: auth.id }).sort({ createdAt: -1 }).limit(100).lean() });
  }
  if (path.match(/^payments\/[a-f\d]{24}\/proof-url$/i)) {
    const auth = await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]);
    const payment = await Payment.findById(path.split("/")[1]);
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
    const proof = await Asset.findOne({ _id: payment.proofAssetId, paymentId: payment._id, assetType: "PAYMENT_PROOF", visibility: "PRIVATE", status: "VALIDATED" });
    if (!proof) throw new HttpError(404, "PAYMENT_PROOF_NOT_FOUND", "Payment proof is unavailable.");
    await writeAudit({ actorId: auth.id, businessId: payment.businessId.toString(), action: "PAYMENT_PROOF_VIEWED", entityType: "Payment", entityId: payment._id.toString(), request });
    return ok({ url: await createSignedPrivateDownload(getR2Settings(), proof.objectKey), expiresIn: getR2Settings().signedUrlTtlSeconds, mimeType: proof.mimeType });
  }
  if (path === "notifications") {
    const auth = await requireAuth(request);
    return ok({ items: await Notification.find({ userId: auth.id }).sort({ createdAt: -1 }).limit(50).lean() });
  }
  if (path === "admin/review-queue") {
    const auth = await requireAuth(request, ADMIN_ROLES as UserRole[]);
    if (!["SUPER_ADMIN", "ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER"].includes(auth.role)) return ok({ items: [] });
    const demos = await DemoProject.find({ status: "READY_FOR_REVIEW" }).select("_id").lean();
    return ok({ items: await Product.find({ demoProjectId: { $in: demos.map((demo) => demo._id) }, approvalStatus: { $in: ["READY_FOR_REVIEW", "NEEDS_MANUAL_REVIEW"] } }).sort({ updatedAt: 1 }).limit(100).lean() });
  }
  if (path === "admin/package-options") {
    await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER"]);
    const demos = await DemoProject.find({ status: "APPROVED_DEMO" }).sort({ approvedAt: 1 }).limit(100).lean();
    const businessIds = demos.map((demo) => demo.businessId);
    const businesses = await Business.find({ _id: { $in: businessIds } }).select("name ownerId").lean();
    const businessMap = new Map(businesses.map((business) => [String(business._id), business]));
    const customers = await User.find({ _id: { $in: businesses.map((business) => business.ownerId) } }).select("fullName email").lean();
    const customerMap = new Map(customers.map((customer) => [String(customer._id), customer]));
    return ok({ items: demos.flatMap((demo) => { const business = businessMap.get(String(demo.businessId)); const customer = business ? customerMap.get(String(business.ownerId)) : undefined; return business && customer ? [{ demoProjectId: String(demo._id), demoName: demo.name, businessId: String(business._id), businessName: business.name, customerId: String(customer._id), customerName: customer.fullName, customerEmail: customer.email }] : []; }) });
  }
  if (path.startsWith("admin/records/")) {
    const auth = await requireAuth(request, ADMIN_ROLES as UserRole[]);
    const section = path.slice("admin/records/".length);
    const allowed = ADMIN_SECTION_ROLES[section];
    if (!allowed) throw new HttpError(404, "ADMIN_SECTION_NOT_FOUND", "Administrative data section not found.");
    requireRole(auth, allowed);
    if (section === "customers") return ok({ items: await User.find({ role: "CUSTOMER" }).select("fullName email country countryCallingCode mobileNumber role businessId emailVerifiedAt suspendedAt suspensionReason createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "businesses") return ok({ items: await Business.find().select("ownerId name slug category country onboardingComplete demoProductCount demoJobCount demoQrCount demoArCount status createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "demo-projects") return ok({ items: await DemoProject.find().select("ownerId businessId name status submittedAt approvedAt createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "products") return ok({ items: await Product.find().select("ownerId businessId demoProjectId name slug category approvalStatus version updatedAt createdAt").sort({ updatedAt: -1 }).limit(100).lean() });
    if (section === "uploads") return ok({ items: await Asset.find({ assetType: { $ne: "PAYMENT_PROOF" } }).select("ownerId businessId productId assetType originalName mimeType size visibility status createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "job-queue") return ok({ items: await ThreeDJob.find().select("ownerId businessId productId status progress currentStep workerId attempts errorCode customerSafeError lockTimestamp startedAt completedAt createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "models") return ok({ items: await Model3D.find().select("businessId productId version status fileSize polygonCount validationWarnings technicallyValid createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "ar-experiences") return ok({ items: await ArExperience.find().select("businessId productId title draftSlug publicSlug status opens publishedAt createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "qr-codes") return ok({ items: await QrCode.find().select("businessId productId uniqueCode destinationPath scans active createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    if (section === "team-members") {
      if (!["SUPER_ADMIN", "ADMIN"].includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "Only senior administrators can view team members.");
      return ok({ items: await User.find({ role: { $ne: "CUSTOMER" } }).select("fullName email role emailVerifiedAt suspendedAt createdAt updatedAt").sort({ createdAt: -1 }).limit(100).lean() });
    }
    if (section === "audit-logs") {
      if (!["SUPER_ADMIN", "ADMIN"].includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "Only senior administrators can view audit logs.");
      return ok({ items: await AuditLog.find().select("actorId businessId action entityType entityId success reason createdAt").sort({ createdAt: -1 }).limit(200).lean() });
    }
    if (section === "storage-usage") {
      const totals = await Asset.aggregate([{ $match: { status: { $ne: "DELETED" } } }, { $group: { _id: "$visibility", bytes: { $sum: "$size" }, files: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
      return ok({ items: totals.map((item) => ({ title: item._id, message: `${item.files} files · ${(item.bytes / 1_073_741_824).toFixed(2)} GB`, status: "ACTIVE" })) });
    }
    if (section === "analytics") {
      const totals = await AnalyticsEvent.aggregate([{ $group: { _id: "$eventType", count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
      return ok({ items: totals.map((item) => ({ title: item._id, message: `${item.count} recorded events`, status: "ACTIVE" })) });
    }
    throw new HttpError(404, "ADMIN_SECTION_NOT_FOUND", "Administrative data section not found.");
  }
  if (path === "admin/worker-health") {
    await requireAuth(request, ADMIN_ROLES as UserRole[]);
    const heartbeat = await WorkerHeartbeat.findOne().sort({ lastHeartbeat: -1 });
    const queueLength = await ThreeDJob.countDocuments({ status: "QUEUED" });
    const online = Boolean(heartbeat && Date.now() - new Date(heartbeat.lastHeartbeat).getTime() < 90_000);
    return ok({ online, lastHeartbeat: heartbeat?.lastHeartbeat, currentJobId: heartbeat?.currentJobId, queueLength, deviceType: heartbeat?.deviceType, workerVersion: heartbeat?.workerVersion });
  }
  if (path === "admin/support") {
    await requireAuth(request, ["SUPER_ADMIN", "ADMIN", "SUPPORT_MANAGER"]);
    const items = await SupportTicket.find().select("ownerId businessId subject category description status priority adminResponse assignedTo resolvedAt createdAt updatedAt").sort({ status: 1, updatedAt: -1 }).limit(200).lean();
    return ok({ items });
  }
  if (path === "admin/settings") {
    await requireAuth(request, ["SUPER_ADMIN", "ADMIN"]);
    const env = getEnvironment();
    return ok({ limits: getDemoLimits(), uploads: { maxImageSizeMb: readPositiveInteger(env.MAX_IMAGE_SIZE_MB, 15), productionModelTargetSizeMb: readPositiveInteger(env.PRODUCTION_MODEL_TARGET_SIZE_MB, 25), signedUrlTtlSeconds: readPositiveInteger(env.R2_SIGNED_URL_TTL_SECONDS, 600) }, mode: env.NODE_ENV, demoMode: env.ALLOW_DEMO_MODE === "true" });
  }
  if (path.startsWith("public/ar/")) {
    const [, , businessSlug, productSlug] = path.split("/");
    return getPublicAr(businessSlug ?? "", productSlug ?? "", request);
  }
  if (/^qr\/[^/]+\/(?:svg|png|transparent|print)$/.test(path)) {
    await dbConnect();
    const qr = await QrCode.findOne({ uniqueCode: path.split("/")[1] ?? "" });
    if (!qr) throw new HttpError(404, "QR_NOT_FOUND", "QR code not found.");
    if (!qr.active) {
      const auth = await requireAuth(request);
      if (auth.isAdmin && !["SUPER_ADMIN", "ADMIN", "AR_PUBLISHER", "DEMO_REVIEWER"].includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "You do not have permission to render product QR assets.");
      if (!auth.isAdmin && qr.ownerId.toString() !== auth.id) throw new HttpError(404, "QR_NOT_FOUND", "QR code not found.");
    }
    const content = `${getEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/q/product/${qr.uniqueCode}`;
    const format = path.split("/")[2];
    if (format === "svg") return new Response(createQrSvg(content, { foreground: qr.foreground, background: qr.background, size: qr.size, errorCorrectionLevel: qr.errorCorrectionLevel }), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
    const buffer = await QRCode.toBuffer(content, { type: "png", width: format === "print" ? Math.max(qr.size, 2048) : qr.size, margin: format === "print" ? 8 : 4, errorCorrectionLevel: qr.errorCorrectionLevel, color: { dark: qr.foreground, light: format === "transparent" ? "#00000000" : qr.background } });
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300", "Content-Disposition": `inline; filename="bsocio-${qr.uniqueCode}-${format}.png"`, "X-Content-Type-Options": "nosniff" } });
  }
  if (path.startsWith("qr/")) {
    await dbConnect();
    const qr = await QrCode.findOne({ uniqueCode: path.split("/")[1] ?? "", active: true });
    if (!qr) throw new HttpError(404, "QR_NOT_ACTIVE", "This QR experience is not active.");
    const ar = await ArExperience.findOne({ _id: qr.arExperienceId, status: "PUBLISHED" });
    if (!ar) throw new HttpError(404, "AR_NOT_PUBLISHED", "This AR experience is not published.");
    const targetProduct = await Product.findById(ar.productId);
    const targetBusiness = await Business.findById(ar.businessId);
    if (!targetProduct || !targetBusiness || ar.publicSlug !== `${targetBusiness.slug}/${targetProduct.slug}`) throw new HttpError(404, "AR_NOT_PUBLISHED", "This AR experience is not published.");
    const canonicalDestination = `/ar/${targetBusiness.slug}/${targetProduct.slug}`;
    try {
      await Promise.all([
        QrCode.updateOne({ _id: qr._id, active: true }, { $inc: { scans: 1 } }),
        AnalyticsEvent.create({ businessId: qr.businessId, productId: targetProduct._id, arExperienceId: ar._id, qrCodeId: qr._id, eventType: "QR_SCAN", deviceType: request.headers.get("user-agent")?.slice(0, 200), referrer: request.headers.get("referer")?.slice(0, 500) }),
      ]);
    } catch (error) { console.error("QR analytics write failed", error); }
    return ok({ destinationPath: canonicalDestination });
  }
  throw new HttpError(404, "API_NOT_FOUND", "API route not found.");
}

async function postRoute(request: NextRequest, path: string) {
  const billingResponse = await handleBillingPost(request, path);
  if (billingResponse) return billingResponse;
  const commerceResponse = await handleCommercePost(request, path);
  if (commerceResponse) return commerceResponse;
  if (path === "auth/register") return register(request);
  if (path === "auth/login") return login(request, false);
  if (path === "auth/admin-login") return login(request, true);
  if (path === "auth/logout") { await clearSessionCookie(); return ok({ message: "Signed out." }); }
  if (path === "auth/forgot-password") return forgotPassword(request);
  if (path === "auth/reset-password") return resetPassword(request);
  if (path === "auth/verify-email") return verifyEmail(request);
  if (path === "account/profile") return updateAccountProfile(request);
  if (path === "account/settings") return updateAccountSettings(request);
  if (path === "account/password") return changeAccountPassword(request);
  if (path === "account/revoke-sessions") return revokeAccountSessions(request);
  if (path === "support") return createSupportTicket(request);
  if (path === "notifications/read") return markNotificationsRead(request);
  if (path === "business") return saveBusiness(request);
  if (path === "demo") return createDemo(request);
  if (path === "products") return createProduct(request);
  if (path === "uploads/sign") return createUploadIntent(request);
  if (path === "uploads/confirm") return confirmUpload(request);
  if (path === "admin/replacements/sign") return createAdminReplacementIntent(request);
  if (path === "admin/replacements/confirm") return confirmAdminReplacement(request);
  if (path === "jobs") return createJob(request);
  if (path === "products/resubmit") return resubmitProduct(request);
  if (path === "demo/submit") return submitDemo(request);
  if (path === "admin/review") return reviewProduct(request);
  if (path === "admin/packages") return createPackage(request);
  if (path === "packages/accept") return acceptPackage(request);
  if (path === "payments") return submitPayment(request);
  if (path === "admin/payments/review") return reviewPayment(request);
  if (path === "admin/products/update") return updateProductByAdmin(request);
  if (path === "admin/team-members") return createTeamMember(request);
  if (path === "admin/customers/account") return changeCustomerAccount(request);
  if (path === "admin/support/respond") return respondSupportTicket(request);
  if (path === "qr-codes/update") return updateQrCode(request);
  if (path === "admin/publish") return publishProduct(request);
  throw new HttpError(404, "API_NOT_FOUND", "API route not found.");
}

export async function GET(request: NextRequest, context: RouteContext) {
  try { return await getRoute(request, await routePath(context)); } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try { return await postRoute(request, await routePath(context)); } catch (error) { return fail(error); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const path = await routePath(context);
    const billingResponse = await handleBillingPatch(request, path);
    if (billingResponse) return billingResponse;
    const commerceResponse = await handleCommercePatch(request, path);
    if (commerceResponse) return commerceResponse;
    if (path === "business") return saveBusiness(request);
    if (path.startsWith("products/")) {
      const auth = await requireAuth(request, ["CUSTOMER"]);
      const current = await requireOwnedProduct(path.split("/")[1] ?? "", auth);
      if (!["UPLOADED", "CHANGES_REQUESTED"].includes(current.approvalStatus)) throw new HttpError(409, "PRODUCT_LOCKED", "Products can be edited only before submission or while an administrator-requested revision is open.");
      const parsed = z.object({
        name: z.string().trim().min(2).max(160).optional(),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
        description: z.string().trim().min(10).max(5000).optional(),
        category: z.string().trim().min(2).max(100).optional(),
        material: z.string().trim().min(1).max(120).optional(),
        colour: z.string().trim().min(1).max(120).optional(),
        customerNotes: z.string().trim().max(3000).optional(),
        scale: z.number().positive().max(100).optional(),
        cameraOrbit: z.string().trim().max(120).optional(),
      }).strict().parse(await request.json());
      Object.assign(current, parsed);
      current.version += 1;
      await current.save();
      return ok(current);
    }
    throw new HttpError(404, "API_NOT_FOUND", "API route not found.");
  } catch (error) { return fail(error); }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const path = await routePath(context);
    const commerceResponse = await handleCommerceDelete(request, path);
    if (commerceResponse) return commerceResponse;
    throw new HttpError(404, "API_NOT_FOUND", "API route not found.");
  } catch (error) { return fail(error); }
}
