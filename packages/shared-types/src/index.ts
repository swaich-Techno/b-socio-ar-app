export const USER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DEMO_REVIEWER",
  "THREE_D_REVIEWER",
  "AR_PUBLISHER",
  "SALES_MANAGER",
  "FINANCE_MANAGER",
  "SUPPORT_MANAGER",
  "CUSTOMER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES = USER_ROLES.filter((role) => role !== "CUSTOMER") as Exclude<
  UserRole,
  "CUSTOMER"
>[];

export const JOB_STATUSES = [
  "UPLOADED",
  "QUEUED",
  "LOCKED",
  "VALIDATING_IMAGE",
  "PROCESSING_BACKGROUND",
  "LOADING_MODEL",
  "GENERATING_MESH",
  "BAKING_TEXTURE",
  "CONVERTING_GLB",
  "OPTIMISING_MODEL",
  "GENERATING_THUMBNAIL",
  "UPLOADING_RESULTS",
  "READY_FOR_REVIEW",
  "NEEDS_MANUAL_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED_DEMO",
  "REJECTED",
  "AWAITING_PACKAGE",
  "AWAITING_PAYMENT",
  "PRODUCTION_APPROVED",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const ASSET_TYPES = [
  "ORIGINAL_IMAGE",
  "SUPPORTING_IMAGE",
  "PROCESSED_IMAGE",
  "MASK",
  "GLB_MODEL",
  "USDZ_MODEL",
  "TEXTURE",
  "THUMBNAIL",
  "QR_PNG",
  "QR_TRANSPARENT_PNG",
  "QR_SVG",
  "QR_PRINT",
  "PAYMENT_PROOF",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetVisibility = "PRIVATE" | "PUBLIC_APPROVED";
export type AssetStatus = "PENDING_UPLOAD" | "UPLOADED" | "VALIDATED" | "REJECTED" | "DELETED";
export type ApprovalDecision =
  | "APPROVE_PRODUCT"
  | "REJECT_PRODUCT"
  | "REQUEST_BETTER_IMAGE"
  | "REQUEST_MORE_IMAGES"
  | "REQUEST_REGENERATION";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  businessId?: string;
  sessionVersion: number;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface JobProgress {
  status: JobStatus;
  progress: number;
  currentStep: string;
  workerId?: string;
  attempts: number;
  errorCode?: string;
  customerSafeError?: string;
  internalTechnicalError?: string;
  lockTimestamp?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface ProductDimensions {
  width: number;
  height: number;
  depth: number;
  unit: "mm" | "cm" | "m" | "in" | "ft";
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  dimensions: ProductDimensions;
  material: string;
  colour: string;
  price?: number;
  currency?: string;
  approvalStatus: JobStatus;
  mainImageAssetId?: string;
  modelId?: string;
  arExperienceId?: string;
  qrCodeId?: string;
}

export interface DashboardMetrics {
  productsUsed: number;
  productLimit: number;
  jobsQueued: number;
  currentJob?: JobProgress;
  modelsReady: number;
  changesRequested: number;
  approvedProducts: number;
  arExperiences: number;
  qrCodes: number;
  scans: number;
  packageStatus?: string;
}

export interface WorkerHealth {
  online: boolean;
  lastHeartbeat?: string;
  currentJobId?: string;
  queueLength: number;
  deviceType?: "cpu" | "cuda";
  workerVersion?: string;
}
