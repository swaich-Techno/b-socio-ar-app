import { describe, expect, it } from "vitest";
import { safeGoogleNextPath } from "@/lib/google-oauth";

describe("Google OAuth redirect security", () => {
  it("keeps users inside the correct portal", () => {
    expect(safeGoogleNextPath("/dashboard/products", "customer")).toBe("/dashboard/products");
    expect(safeGoogleNextPath("/admin/team-members", "admin")).toBe("/admin/team-members");
    expect(safeGoogleNextPath("/admin/team-members", "customer")).toBe("/dashboard");
    expect(safeGoogleNextPath("/dashboard", "admin")).toBe("/admin");
  });

  it("rejects external and backslash redirect forms", () => {
    expect(safeGoogleNextPath("//example.com", "customer")).toBe("/dashboard");
    expect(safeGoogleNextPath("/\\example.com", "admin")).toBe("/admin");
    expect(safeGoogleNextPath("https://example.com", "customer")).toBe("/dashboard");
  });
});
