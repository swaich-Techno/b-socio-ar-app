import { z } from "zod";
import { ASSET_TYPES, JOB_STATUSES } from "@bsocio/shared-types";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier");
const strongPassword = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/\d/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");
const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");
const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]).optional();

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    country: z.string().trim().min(2).max(100),
    countryCallingCode: z.string().trim().regex(/^\+[1-9]\d{0,3}$/, "Use a code such as +1 or +91"),
    mobileNumber: z.string().trim().regex(/^\d{6,15}$/, "Use 6 to 15 digits without spaces"),
    password: strongPassword,
    confirmPassword: z.string(),
    businessName: z.string().trim().min(2).max(160),
    businessCategory: z.string().trim().min(2).max(100),
    termsAccepted: z.literal(true, { errorMap: () => ({ message: "Accept the terms to continue" }) }),
    privacyAccepted: z.literal(true, { errorMap: () => ({ message: "Accept the privacy policy to continue" }) }),
  })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const loginSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) })
  .strict();

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();

export const resetPasswordSchema = z
  .object({ token: z.string().min(32).max(512), password: strongPassword, confirmPassword: z.string() })
  .strict()
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const businessSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug,
    category: z.string().trim().min(2).max(100),
    country: z.string().trim().min(2).max(100),
    website: optionalUrl,
    whatsapp: z.string().trim().max(30).optional(),
    instagram: z.string().trim().max(100).optional(),
    primaryColour: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  })
  .strict();

export const demoProjectSchema = z
  .object({ name: z.string().trim().min(2).max(120), notes: z.string().trim().max(2000).optional() })
  .strict();

export const productSchema = z
  .object({
    demoProjectId: objectId,
    name: z.string().trim().min(2).max(160),
    slug,
    description: z.string().trim().min(10).max(5000),
    category: z.string().trim().min(2).max(100),
    dimensions: z
      .object({
        width: z.coerce.number().positive().max(1_000_000),
        height: z.coerce.number().positive().max(1_000_000),
        depth: z.coerce.number().positive().max(1_000_000),
        unit: z.enum(["mm", "cm", "m", "in", "ft"]),
      })
      .strict(),
    material: z.string().trim().min(1).max(120),
    colour: z.string().trim().min(1).max(120),
    price: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    customerNotes: z.string().trim().max(3000).optional(),
  })
  .strict()
  .refine((value) => (value.price === undefined) === (value.currency === undefined), {
    path: ["currency"],
    message: "Price and currency must be supplied together",
  });

export const uploadIntentSchema = z
  .object({
    productId: objectId.optional(),
    packageId: objectId.optional(),
    assetType: z.enum(ASSET_TYPES),
    slot: z.enum(["MAIN", "FRONT", "BACK", "LEFT", "RIGHT", "TOP", "SUPPORTING"]).optional(),
    originalName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "model/gltf-binary", "application/pdf"]),
    size: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[a-f\d]{64}$/i),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assetType === "PAYMENT_PROOF" && !value.packageId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["packageId"], message: "Package is required for payment proof" });
    }
    if (value.assetType !== "PAYMENT_PROOF" && !value.productId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["productId"], message: "Product is required for product assets" });
    }
  });

export const uploadConfirmationSchema = z
  .object({ assetId: objectId, checksumSha256: z.string().regex(/^[a-f\d]{64}$/i) })
  .strict();

export const replacementUploadSchema = z.object({
  productId: objectId,
  assetType: z.enum(["GLB_MODEL", "USDZ_MODEL", "THUMBNAIL"]),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["model/gltf-binary", "model/vnd.usdz+zip", "image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f\d]{64}$/i),
}).strict();

export const teamMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["ADMIN", "DEMO_REVIEWER", "THREE_D_REVIEWER", "AR_PUBLISHER", "SALES_MANAGER", "FINANCE_MANAGER", "SUPPORT_MANAGER"]),
  password: strongPassword,
}).strict();

export const customerAccountActionSchema = z.object({
  userId: objectId,
  action: z.enum(["SUSPEND", "RESTORE"]),
  reason: z.string().trim().min(3).max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "SUSPEND" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A suspension reason is required" });
});

export const createJobSchema = z.object({ productId: objectId, sourceAssetId: objectId }).strict();

export const reviewSchema = z
  .object({
    productId: objectId,
    decision: z.enum([
      "APPROVE_PRODUCT",
      "REJECT_PRODUCT",
      "REQUEST_BETTER_IMAGE",
      "REQUEST_MORE_IMAGES",
      "REQUEST_REGENERATION",
    ]),
    customerFeedback: z.string().trim().max(3000).optional(),
    internalNotes: z.string().trim().max(5000).optional(),
    expectedProductVersion: z.number().int().positive(),
    expectedModelVersion: z.number().int().positive().optional(),
  })
  .strict();

export const packageSchema = z
  .object({
    customerId: objectId,
    businessId: objectId,
    demoProjectId: objectId,
    name: z.string().trim().min(2).max(160),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    setupFee: z.number().nonnegative(),
    monthlyFee: z.number().nonnegative().optional(),
    annualFee: z.number().nonnegative().optional(),
    tax: z.number().min(0).max(100),
    discount: z.number().min(0).max(100),
    productLimit: z.number().int().positive(),
    qrLimit: z.number().int().positive(),
    arLimit: z.number().int().positive(),
    futureThreeDGenerationLimit: z.number().int().nonnegative(),
    storageGb: z.number().positive(),
    trafficGb: z.number().positive(),
    analyticsLevel: z.string().trim().max(120),
    brandingOptions: z.array(z.string().trim().max(120)).max(30),
    supportLevel: z.string().trim().max(120),
    deliveryTimeline: z.string().trim().max(500),
    renewalRules: z.string().trim().max(2000),
    expiresAt: z.coerce.date(),
    customTerms: z.string().trim().max(10_000),
    customerNotes: z.string().trim().max(3000).optional(),
    internalNotes: z.string().trim().max(5000).optional(),
  })
  .strict();

export const paymentSubmissionSchema = z
  .object({
    packageId: objectId,
    method: z.enum(["BANK_TRANSFER", "UPI", "OFFLINE"]),
    transactionReference: z.string().trim().min(3).max(160),
    proofAssetId: objectId,
    customerNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const statusSchema = z.enum(JOB_STATUSES);
export { objectId, slug, strongPassword };

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type ProductInput = z.infer<typeof productSchema>;
