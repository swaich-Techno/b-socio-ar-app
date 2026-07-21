import { describe, expect, it } from "vitest";
import { buildPrivateObjectKey, detectContentType, sha256HexToBase64, validateImageIntent, validatePaymentProofIntent, validateReplacementIntent } from "@bsocio/storage";

const intent = { businessId: "business-1", productId: "product-1", ownerId: "owner-1", assetType: "ORIGINAL_IMAGE" as const, originalName: "chair.png", contentType: "image/png", contentLength: 1024, checksumSha256: "a".repeat(64) };

describe("private upload policy", () => {
  it("creates internal tenant-scoped keys without customer filenames", () => {
    const key = buildPrivateObjectKey(intent);
    expect(key).toMatch(/^businesses\/business-1\/products\/product-1\/original-image\/[a-f0-9-]+\.png$/);
    expect(key).not.toContain("chair");
  });

  it("rejects MIME and filename mismatches", () => {
    expect(() => validateImageIntent({ ...intent, originalName: "chair.jpg" }, 15)).toThrow(/MIME type/);
  });

  it("keeps payment proof in a package-scoped private key", () => {
    const proof = { ...intent, productId: undefined, packageId: "package-1", assetType: "PAYMENT_PROOF" as const, originalName: "receipt.pdf", contentType: "application/pdf" };
    validatePaymentProofIntent(proof, 15);
    expect(buildPrivateObjectKey(proof)).toMatch(/^businesses\/business-1\/payments\/package-1\/payment-proof\/[a-f0-9-]+\.pdf$/);
  });

  it("accepts only correctly named replacement model formats", () => {
    const replacement = { ...intent, assetType: "GLB_MODEL" as const, originalName: "replacement.glb", contentType: "model/gltf-binary" };
    expect(() => validateReplacementIntent(replacement, 25, 15)).not.toThrow();
    expect(() => validateReplacementIntent({ ...replacement, originalName: "replacement.obj" }, 25, 15)).toThrow(/Replacement GLB/);
  });

  it("converts browser hexadecimal SHA-256 into the native S3 checksum encoding", () => {
    expect(sha256HexToBase64("00".repeat(32))).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  });

  it("identifies accepted file formats from bytes instead of trusting MIME metadata", () => {
    expect(detectContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectContentType(new TextEncoder().encode("not-a-real-file"))).toBeUndefined();
  });
});
