import type { JobStatus } from "@bsocio/shared-types";

export const DEMO_LIMITS = Object.freeze({
  projects: 1,
  products: 5,
  qrCodes: 5,
  arExperiences: 5,
  threeDJobs: 5,
  supportingImagesPerProduct: 6,
  concurrentJobsPerBusiness: 1,
});

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const DEFAULT_MAX_IMAGE_SIZE_MB = 15;
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
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
];

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["PUBLISHED", "FAILED", "CANCELLED", "REJECTED"];

export const JOB_PROGRESS: Record<JobStatus, number> = {
  UPLOADED: 0,
  QUEUED: 2,
  LOCKED: 4,
  VALIDATING_IMAGE: 8,
  PROCESSING_BACKGROUND: 15,
  LOADING_MODEL: 22,
  GENERATING_MESH: 40,
  BAKING_TEXTURE: 58,
  CONVERTING_GLB: 68,
  OPTIMISING_MODEL: 76,
  GENERATING_THUMBNAIL: 86,
  UPLOADING_RESULTS: 94,
  READY_FOR_REVIEW: 100,
  NEEDS_MANUAL_REVIEW: 100,
  CHANGES_REQUESTED: 100,
  APPROVED_DEMO: 100,
  REJECTED: 100,
  AWAITING_PACKAGE: 100,
  AWAITING_PAYMENT: 100,
  PRODUCTION_APPROVED: 100,
  PUBLISHED: 100,
  FAILED: 100,
  CANCELLED: 100,
};

export const isActiveJobStatus = (status: JobStatus): boolean => ACTIVE_JOB_STATUSES.includes(status);

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDemoLimits(env: Record<string, string | undefined> = process.env) {
  return {
    projects: readPositiveInteger(env.MAX_DEMO_PROJECTS_PER_BUSINESS, DEMO_LIMITS.projects),
    products: readPositiveInteger(env.MAX_DEMO_PRODUCTS_PER_BUSINESS, DEMO_LIMITS.products),
    qrCodes: readPositiveInteger(env.MAX_DEMO_QR_CODES_PER_BUSINESS, DEMO_LIMITS.qrCodes),
    arExperiences: readPositiveInteger(env.MAX_DEMO_AR_EXPERIENCES_PER_BUSINESS, DEMO_LIMITS.arExperiences),
    threeDJobs: readPositiveInteger(env.MAX_DEMO_3D_JOBS_PER_BUSINESS, DEMO_LIMITS.threeDJobs),
    supportingImagesPerProduct: readPositiveInteger(
      env.MAX_SUPPORTING_IMAGES_PER_PRODUCT,
      DEMO_LIMITS.supportingImagesPerProduct,
    ),
    concurrentJobsPerBusiness: readPositiveInteger(
      env.MAX_CONCURRENT_3D_JOBS_PER_BUSINESS,
      DEMO_LIMITS.concurrentJobsPerBusiness,
    ),
  };
}
