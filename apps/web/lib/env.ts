import { z } from "zod";
import { readPositiveInteger } from "@bsocio/constants";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["development", "test", "production"]).default("development"),
  ),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  MONGODB_URI: optionalString,
  MONGODB_DB_NAME: z.string().default("bsocio_ar"),
  AUTH_SECRET: optionalString,
  AUTH_COOKIE_NAME: z.string().default("bsocio_session"),
  SESSION_TTL_SECONDS: optionalString,
  SUPER_ADMIN_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
  SUPER_ADMIN_PASSWORD_HASH: optionalString,
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_ENDPOINT: optionalUrl,
  R2_PRIVATE_BUCKET: optionalString,
  R2_PUBLIC_BUCKET: optionalString,
  R2_PUBLIC_DOMAIN: optionalUrl,
  R2_SIGNED_URL_TTL_SECONDS: optionalString,
  THREE_D_WORKER_SECRET: optionalString,
  MAX_IMAGE_SIZE_MB: optionalString,
  PRODUCTION_MODEL_TARGET_SIZE_MB: optionalString,
  LOGIN_RATE_LIMIT_WINDOW_MS: optionalString,
  LOGIN_RATE_LIMIT_MAX: optionalString,
  PASSWORD_RESET_TTL_MINUTES: optionalString,
  EMAIL_VERIFICATION_TTL_HOURS: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalString,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  EMAIL_FROM: optionalString,
  ALLOW_DEMO_MODE: z.enum(["true", "false"]).default("false"),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.ALLOW_DEMO_MODE === "true") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ALLOW_DEMO_MODE"], message: "ALLOW_DEMO_MODE cannot be enabled in production" });
  }
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

let cached: ServerEnvironment | undefined;

export function getEnvironment(): ServerEnvironment {
  cached ??= serverEnvironmentSchema.parse(process.env);
  return cached;
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getMongoSettings() {
  const env = getEnvironment();
  return { uri: requireValue(env.MONGODB_URI, "MONGODB_URI"), databaseName: env.MONGODB_DB_NAME };
}

export function getAuthSettings() {
  const env = getEnvironment();
  const secret = requireValue(env.AUTH_SECRET, "AUTH_SECRET");
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return {
    secret,
    cookieName: env.AUTH_COOKIE_NAME,
    ttlSeconds: readPositiveInteger(env.SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
    secure: env.NODE_ENV === "production",
  };
}

export function getR2Settings() {
  const env = getEnvironment();
  return {
    endpoint: requireValue(env.R2_ENDPOINT, "R2_ENDPOINT"),
    accessKeyId: requireValue(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
    secretAccessKey: requireValue(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"),
    privateBucket: requireValue(env.R2_PRIVATE_BUCKET, "R2_PRIVATE_BUCKET"),
    publicBucket: requireValue(env.R2_PUBLIC_BUCKET, "R2_PUBLIC_BUCKET"),
    signedUrlTtlSeconds: readPositiveInteger(env.R2_SIGNED_URL_TTL_SECONDS, 600),
  };
}

export function getEmailSettings() {
  const env = getEnvironment();
  return {
    host: requireValue(env.SMTP_HOST, "SMTP_HOST"),
    port: readPositiveInteger(env.SMTP_PORT, 587),
    user: requireValue(env.SMTP_USER, "SMTP_USER"),
    password: requireValue(env.SMTP_PASSWORD, "SMTP_PASSWORD"),
    from: requireValue(env.EMAIL_FROM, "EMAIL_FROM"),
    appUrl: env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
  };
}

export function clearEnvironmentCacheForTests(): void {
  cached = undefined;
}
