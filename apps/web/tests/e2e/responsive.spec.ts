import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";

const widths = [320, 375, 390, 430, 768, 1024, 1440];
const secret = "playwright-only-secret-that-is-longer-than-thirty-two-characters";
const productId = "507f1f77bcf86cd799439011";

async function sessionToken(role: string) {
  return new SignJWT({ email: `${role.toLowerCase()}@example.test`, name: "Responsive Tester", role, businessId: "507f1f77bcf86cd799439012", sessionVersion: 1 })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject("507f1f77bcf86cd799439010").setIssuer("b-socio-ar").setAudience("b-socio-web").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
}

async function mockAuthenticatedApis(page: import("@playwright/test").Page, role: string) {
  await page.context().addCookies([{ name: "bsocio_session", value: await sessionToken(role), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { items: [] };
    if (path === "/api/auth/session") data = { user: { id: "507f1f77bcf86cd799439010", fullName: "Responsive Tester", email: "tester@example.test", role, businessId: "507f1f77bcf86cd799439012", sessionVersion: 1, isAdmin: role !== "CUSTOMER" } };
    else if (path === "/api/dashboard") data = { productsUsed: 1, productLimit: 5, jobsQueued: 0, modelsReady: 1, changesRequested: 0, approvedProducts: 1, arExperiences: 1, qrCodes: 1, scans: 12, packageStatus: "ACCEPTED" };
    else if (path === "/api/account") data = { user: { fullName: "Responsive Tester", email: "tester@example.test", country: "United States", countryCallingCode: "+1", mobileNumber: "5551234567", locale: "en-US", timeZone: "America/Los_Angeles", emailVerifiedAt: new Date().toISOString(), createdAt: new Date().toISOString() } };
    else if (path === "/api/business") data = { business: { name: "Responsive Studio", slug: "responsive-studio", category: "Retail", country: "United States", onboardingComplete: true, primaryColour: "#2563EB" } };
    else if (path === "/api/demo") data = { demo: { _id: "507f1f77bcf86cd799439013", name: "Five product demo", status: "READY_FOR_REVIEW", notes: "Responsive fixture" } };
    else if (path === "/api/products") data = { items: [{ _id: productId, name: "Aurora Chair", slug: "aurora-chair", category: "Furniture", description: "A representative product for responsive layout checks.", approvalStatus: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() }], total: 1, limit: 5 };
    else if (path === `/api/products/${productId}`) data = { product: { _id: productId, name: "Aurora Chair", slug: "aurora-chair", category: "Furniture", description: "A representative product for responsive layout checks.", material: "Wood", colour: "Blue", dimensions: { width: 50, height: 90, depth: 55, unit: "cm" }, approvalStatus: "READY_FOR_REVIEW", version: 2, scale: 1 }, assets: [], jobs: [], models: [], approvals: [], ar: null, qr: null };
    else if (path === "/api/qr-codes") data = { items: [{ _id: "507f1f77bcf86cd799439015", productId, uniqueCode: "responsive", destinationPath: "/ar/responsive-studio/aurora-chair", foreground: "#0F172A", background: "#FFFFFF", errorCorrectionLevel: "H", size: 512, callToAction: "View in AR", scans: 12, active: true }] };
    else if (path === "/api/analytics") data = { summary: { qrScans: 12, arOpens: 8 }, items: [] };
    else if (path === "/api/admin/worker-health") data = { online: true, lastHeartbeat: new Date().toISOString(), queueLength: 0, deviceType: "cpu", workerVersion: "0.1.0" };
    else if (path === "/api/admin/review-queue") data = { items: [{ _id: productId, name: "Aurora Chair", category: "Furniture", approvalStatus: "READY_FOR_REVIEW", businessId: "507f1f77bcf86cd799439012", updatedAt: new Date().toISOString() }] };
    else if (path === "/api/admin/settings") data = { limits: { products: 5, qrCodes: 5, arExperiences: 5, threeDJobs: 5, concurrentJobsPerBusiness: 1 }, uploads: { maxImageSizeMb: 15, productionModelTargetSizeMb: 25, signedUrlTtlSeconds: 600 }, mode: "test", demoMode: false };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
}

test("public and authentication pages never overflow the target widths", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 700 ? 820 : 900 });
    for (const path of ["/", "/login", "/register", "/admin/login"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(sizes.scroll, `${path} overflows at ${width}px`).toBeLessThanOrEqual(sizes.client);
    }
  }
});

test("there is no public administrator registration", async ({ page }) => {
  const response = await page.goto("/admin/register");
  expect(response?.status()).toBe(404);
});

test("core controls meet the mobile touch target", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  const sizes = await page.locator('button, a.button, input:not([type="checkbox"]):not([type="radio"]), .check-row').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, height: element.getBoundingClientRect().height })).filter((value) => value.height > 0));
  expect(sizes.every((item) => item.height >= 44), JSON.stringify(sizes)).toBe(true);
});

test("every customer and administrator route stays inside all target widths", async ({ page }) => {
  test.setTimeout(360_000);
  const customerPaths = ["/dashboard", "/dashboard/business", "/dashboard/demo", "/dashboard/products", "/dashboard/products/new", `/dashboard/products/${productId}`, "/dashboard/uploads", "/dashboard/3d-generation", "/dashboard/models", "/dashboard/ar-experiences", "/dashboard/qr-codes", "/dashboard/approval-status", "/dashboard/custom-package", "/dashboard/payments", "/dashboard/analytics", "/dashboard/notifications", "/dashboard/support", "/dashboard/profile", "/dashboard/security", "/dashboard/settings"];
  const adminPaths = ["/admin", "/admin/customers", "/admin/businesses", "/admin/demo-projects", "/admin/products", `/admin/products/${productId}`, "/admin/uploads", "/admin/job-queue", "/admin/models", "/admin/ar-experiences", "/admin/qr-codes", "/admin/approval-queue", "/admin/packages", "/admin/payments", "/admin/team-members", "/admin/support", "/admin/analytics", "/admin/worker-health", "/admin/storage-usage", "/admin/audit-logs", "/admin/settings"];
  await mockAuthenticatedApis(page, "SUPER_ADMIN");
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 700 ? 820 : 900 });
    for (const path of [...customerPaths, ...adminPaths]) {
      if (path.startsWith("/dashboard")) await page.context().addCookies([{ name: "bsocio_session", value: await sessionToken("CUSTOMER"), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      else await page.context().addCookies([{ name: "bsocio_session", value: await sessionToken("SUPER_ADMIN"), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(sizes.scroll, `${path} overflows at ${width}px`).toBeLessThanOrEqual(sizes.client);
    }
  }
});
