import {
  CopyObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import path from "node:path";
import { ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_MIME_TYPES, DEFAULT_SIGNED_URL_TTL_SECONDS } from "@bsocio/constants";
import type { AssetType } from "@bsocio/shared-types";

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
  signedUrlTtlSeconds?: number;
}

export interface UploadIntent {
  businessId: string;
  productId?: string;
  packageId?: string;
  ownerId: string;
  assetType: AssetType;
  originalName: string;
  contentType: string;
  contentLength: number;
  checksumSha256: string;
}

export function sha256HexToBase64(value: string): string {
  if (!/^[a-f\d]{64}$/i.test(value)) throw new Error("A valid SHA-256 checksum is required.");
  return Buffer.from(value, "hex").toString("base64");
}

export function detectContentType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "glTF") return "model/gltf-binary";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "model/vnd.usdz+zip";
  return undefined;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "model/gltf-binary": "glb",
  "model/vnd.usdz+zip": "usdz",
  "application/pdf": "pdf",
};

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
  });
}

export function validateImageIntent(intent: UploadIntent, maxSizeMb = 15): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(intent.contentType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error("Unsupported image type. Use JPG, PNG or WebP.");
  }
  if (intent.contentLength <= 0 || intent.contentLength > maxSizeMb * 1024 * 1024) {
    throw new Error(`Image must be larger than zero and no more than ${maxSizeMb} MB.`);
  }
  const suppliedExtension = path.extname(intent.originalName).toLowerCase().replace(".", "");
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(suppliedExtension as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])) {
    throw new Error("Filename extension does not match an accepted image type.");
  }
  const expected = MIME_EXTENSIONS[intent.contentType];
  if (expected === "jpg" && !["jpg", "jpeg"].includes(suppliedExtension)) {
    throw new Error("Filename extension does not match the MIME type.");
  }
  if (expected !== "jpg" && expected !== suppliedExtension) {
    throw new Error("Filename extension does not match the MIME type.");
  }
  if (!/^[a-f\d]{64}$/i.test(intent.checksumSha256)) throw new Error("A SHA-256 checksum is required.");
}

export function validatePaymentProofIntent(intent: UploadIntent, maxSizeMb = 15): void {
  const accepted = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!accepted.includes(intent.contentType)) throw new Error("Payment proof must be JPG, PNG, WebP or PDF.");
  if (intent.contentLength <= 0 || intent.contentLength > maxSizeMb * 1024 * 1024) {
    throw new Error(`Payment proof must be larger than zero and no more than ${maxSizeMb} MB.`);
  }
  const suppliedExtension = path.extname(intent.originalName).toLowerCase().replace(".", "");
  const expected = MIME_EXTENSIONS[intent.contentType];
  if ((expected === "jpg" && !["jpg", "jpeg"].includes(suppliedExtension)) || (expected !== "jpg" && expected !== suppliedExtension)) {
    throw new Error("Filename extension does not match the payment-proof MIME type.");
  }
  if (!/^[a-f\d]{64}$/i.test(intent.checksumSha256)) throw new Error("A SHA-256 checksum is required.");
}

export function validateReplacementIntent(intent: UploadIntent, maxModelSizeMb = 25, maxImageSizeMb = 15): void {
  const suppliedExtension = path.extname(intent.originalName).toLowerCase().replace(".", "");
  if (intent.assetType === "GLB_MODEL" && (intent.contentType !== "model/gltf-binary" || suppliedExtension !== "glb")) throw new Error("Replacement GLB must use a .glb filename and model/gltf-binary MIME type.");
  if (intent.assetType === "USDZ_MODEL" && (intent.contentType !== "model/vnd.usdz+zip" || suppliedExtension !== "usdz")) throw new Error("Replacement USDZ must use a .usdz filename and model/vnd.usdz+zip MIME type.");
  if (intent.assetType === "THUMBNAIL") validateImageIntent(intent, maxImageSizeMb);
  const maximum = intent.assetType === "THUMBNAIL" ? maxImageSizeMb : maxModelSizeMb;
  if (intent.contentLength <= 0 || intent.contentLength > maximum * 1024 * 1024) throw new Error(`Replacement file must be larger than zero and no more than ${maximum} MB.`);
  if (!/^[a-f\d]{64}$/i.test(intent.checksumSha256)) throw new Error("A SHA-256 checksum is required.");
}

export function buildPrivateObjectKey(intent: UploadIntent): string {
  const extension = MIME_EXTENSIONS[intent.contentType];
  if (!extension) throw new Error("Unsupported asset MIME type");
  const type = intent.assetType.toLowerCase().replaceAll("_", "-");
  const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "");
  const scope = intent.productId
    ? `products/${safeId(intent.productId)}`
    : `payments/${safeId(intent.packageId ?? "unassigned")}`;
  return `businesses/${safeId(intent.businessId)}/${scope}/${type}/${randomUUID()}.${extension}`;
}

export async function createSignedUpload(
  config: R2Config,
  key: string,
  intent: UploadIntent,
): Promise<{ url: string; expiresIn: number; requiredHeaders: Record<string, string> }> {
  const expiresIn = Math.min(Math.max(config.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS, 300), 900);
  const checksumSha256 = sha256HexToBase64(intent.checksumSha256);
  const command = new PutObjectCommand({
    Bucket: config.privateBucket,
    Key: key,
    ContentType: intent.contentType,
    ContentLength: intent.contentLength,
    ChecksumSHA256: checksumSha256,
    IfNoneMatch: "*",
    Metadata: {
      owner: intent.ownerId,
      ...(intent.productId ? { product: intent.productId } : {}),
      ...(intent.packageId ? { package: intent.packageId } : {}),
      checksum: intent.checksumSha256.toLowerCase(),
      assettype: intent.assetType,
    },
  });
  return {
    url: await getSignedUrl(createR2Client(config), command, { expiresIn }),
    expiresIn,
    requiredHeaders: {
      "Content-Type": intent.contentType,
      "If-None-Match": "*",
      "x-amz-checksum-sha256": checksumSha256,
      "x-amz-meta-owner": intent.ownerId,
      ...(intent.productId ? { "x-amz-meta-product": intent.productId } : {}),
      ...(intent.packageId ? { "x-amz-meta-package": intent.packageId } : {}),
      "x-amz-meta-checksum": intent.checksumSha256.toLowerCase(),
      "x-amz-meta-assettype": intent.assetType,
    },
  };
}

export async function createSignedPrivateDownload(config: R2Config, key: string): Promise<string> {
  const expiresIn = Math.min(Math.max(config.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS, 300), 900);
  return getSignedUrl(createR2Client(config), new GetObjectCommand({ Bucket: config.privateBucket, Key: key }), {
    expiresIn,
  });
}

export async function confirmPrivateObject(config: R2Config, key: string) {
  const client = createR2Client(config);
  const head = await client.send(new HeadObjectCommand({ Bucket: config.privateBucket, Key: key, ChecksumMode: "ENABLED" }));
  const maximumBytes = 250 * 1024 * 1024;
  if (!head.ContentLength || head.ContentLength > maximumBytes) throw new Error("Stored object size is invalid.");
  const result = await client.send(new GetObjectCommand({ Bucket: config.privateBucket, Key: key, ChecksumMode: "ENABLED" }));
  if (!result.Body) throw new Error("Stored object body is unavailable.");
  const bytes = await result.Body.transformToByteArray();
  return {
    contentLength: result.ContentLength ?? bytes.byteLength,
    contentType: result.ContentType,
    detectedContentType: detectContentType(bytes),
    checksumSha256: result.ChecksumSHA256 ?? head.ChecksumSHA256,
    calculatedChecksumSha256: createHash("sha256").update(bytes).digest("base64"),
    etag: result.ETag,
    metadata: result.Metadata,
  };
}

export async function publishApprovedObject(config: R2Config, privateKey: string, publicKey: string): Promise<void> {
  await createR2Client(config).send(
    new CopyObjectCommand({
      Bucket: config.publicBucket,
      Key: publicKey,
      CopySource: `${config.privateBucket}/${encodeURIComponent(privateKey).replaceAll("%2F", "/")}`,
      MetadataDirective: "COPY",
    }),
  );
}
