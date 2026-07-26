import { describe, expect, it } from "vitest";
import { JOB_STATUSES, USER_ROLES } from "@bsocio/shared-types";
import { DEMO_LIMITS, getDemoLimits } from "@bsocio/constants";
import { forgotPasswordSchema, productSchema, registrationSchema, reviewSchema } from "@bsocio/validation";

describe("shared workflow contracts", () => {
  it("keeps the exact cross-runtime status vocabulary", () => {
    expect(JOB_STATUSES).toHaveLength(23);
    expect(JOB_STATUSES).toContain("QUEUED");
    expect(JOB_STATUSES).toContain("PUBLISHED");
    expect(JOB_STATUSES).not.toContain("PROCESSING");
  });

  it("defines every role and never accepts a role during registration", () => {
    expect(USER_ROLES).toContain("SUPER_ADMIN");
    expect(USER_ROLES).toContain("CUSTOMER");
    const result = registrationSchema.safeParse({
      fullName: "A Customer", email: "customer@example.com", country: "United States",
      countryCallingCode: "+1", mobileNumber: "5551234567", password: "VerySecure!123",
      confirmPassword: "VerySecure!123", businessName: "Example Business", businessCategory: "Retail",
      termsAccepted: true, privacyAccepted: true, role: "SUPER_ADMIN",
    });
    expect(result.success).toBe(false);
  });

  it("defaults the demo to five products and one concurrent job", () => {
    expect(DEMO_LIMITS.products).toBe(5);
    expect(getDemoLimits({})).toMatchObject({ products: 5, concurrentJobsPerBusiness: 1, qrCodes: 5, arExperiences: 5 });
  });

  it("requires complete physical dimensions", () => {
    const parsed = productSchema.safeParse({ demoProjectId: "507f1f77bcf86cd799439011", name: "Demo chair", slug: "demo-chair", description: "A product description long enough.", category: "Furniture", dimensions: { width: 42, height: 80, depth: 45, unit: "cm" }, material: "Wood", colour: "Blue" });
    expect(parsed.success).toBe(true);
  });

  it("requires the administrator to review the exact product and model versions", () => {
    expect(reviewSchema.safeParse({ productId: "507f1f77bcf86cd799439011", decision: "APPROVE_PRODUCT" }).success).toBe(false);
    expect(reviewSchema.safeParse({ productId: "507f1f77bcf86cd799439011", decision: "APPROVE_PRODUCT", expectedProductVersion: 3, expectedModelVersion: 2 }).success).toBe(true);
  });

  it("keeps password recovery scoped to the selected sign-in portal", () => {
    expect(forgotPasswordSchema.safeParse({ email: "admin@example.com", portal: "admin" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "admin@example.com", portal: "super-admin" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "admin@example.com" }).success).toBe(false);
  });
});
