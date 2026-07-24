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
    else if (path === "/api/business") data = { business: { name: "Responsive Café", slug: "responsive-cafe", category: "Restaurant / Café", country: "United States", onboardingComplete: true, primaryColour: "#7C4A12" } };
    else if (path === "/api/demo") data = { demo: { _id: "507f1f77bcf86cd799439013", name: "Five product demo", status: "READY_FOR_REVIEW", notes: "Responsive fixture" } };
    else if (path === "/api/products") data = { items: [{ _id: productId, name: "Aurora Chair", slug: "aurora-chair", category: "Furniture", description: "A representative product for responsive layout checks.", approvalStatus: "READY_FOR_REVIEW", updatedAt: new Date().toISOString() }], total: 1, limit: 5 };
    else if (path === `/api/products/${productId}`) data = { product: { _id: productId, name: "Aurora Chair", slug: "aurora-chair", category: "Furniture", description: "A representative product for responsive layout checks.", material: "Wood", colour: "Blue", dimensions: { width: 50, height: 90, depth: 55, unit: "cm" }, approvalStatus: "READY_FOR_REVIEW", version: 2, scale: 1 }, assets: [], jobs: [], models: [], approvals: [], ar: null, qr: null };
    else if (path === "/api/qr-codes") data = { items: [{ _id: "507f1f77bcf86cd799439015", productId, uniqueCode: "responsive", destinationPath: "/ar/responsive-studio/aurora-chair", foreground: "#0F172A", background: "#FFFFFF", errorCorrectionLevel: "H", size: 512, callToAction: "View in AR", scans: 12, active: true }] };
    else if (path === "/api/analytics") data = { summary: { qrScans: 12, arOpens: 8 }, items: [] };
    else if (path === "/api/restaurant/tables") data = { items: [{ _id: "507f1f77bcf86cd799439020", tableNumber: "7", tableName: "Table 7", branchId: "main", section: "Rooftop", capacity: 4, status: "ACTIVE", scanCount: 18, currentMenuDestination: "/menu/responsive-cafe", uniqueQrCode: "table-responsive", qrCreatedAt: new Date().toISOString() }] };
    else if (path === "/api/restaurant/tables/507f1f77bcf86cd799439020") data = { table: { _id: "507f1f77bcf86cd799439020", tableNumber: "7", tableName: "Table 7", branchId: "main", section: "Rooftop", capacity: 4, status: "ACTIVE", scanCount: 18, currentMenuDestination: "/menu/responsive-cafe", internalNotes: "", uniqueQrCode: "table-responsive", qrCreatedAt: new Date().toISOString() } };
    else if (path === "/api/restaurant/settings") data = { settings: { whatsappCountryCode: "+91", whatsappNumber: "919876543210", defaultOrderLanguage: "en", currency: "INR", taxPercentage: 5, serviceChargePercentage: 0, minimumOrderAmount: 0, orderAvailability: "ACCEPTING", defaultWhatsappMessage: "", tableNumberingFormat: "Table {number}", menuLanguages: ["en"], orderInstructions: "Order directly from your table.", openingHours: "Daily, 10:00–23:00", branchNumbers: [] } };
    else if (path === "/api/restaurant/menu-items") data = { items: [{ product: { id: productId, name: "Margherita Pizza", slug: "margherita-pizza", description: "Stone-baked pizza with tomato, basil and mozzarella.", category: "Food", price: 350, currency: "INR" }, profile: { menuCategory: "MAIN_COURSE", ingredients: ["Tomato", "Basil", "Mozzarella"], allergens: ["Milk", "Gluten"], vegetarian: true, vegan: false, spiceLevel: 1, availability: "AVAILABLE", showWhenUnavailable: true } }] };
    else if (path === "/api/restaurant/orders") data = { items: [{ _id: "507f1f77bcf86cd799439022", orderId: "ORD-8F31C2", status: "WHATSAPP_OPENED", estimatedTotal: 367.5, currency: "INR", items: [{ productNameSnapshot: "Margherita Pizza", quantity: 1 }], table: { tableName: "Table 7" }, updatedAt: new Date().toISOString() }] };
    else if (path === "/api/restaurant/analytics") data = { summary: { tableScans: 18, uniqueSessions: 14, menuViews: 24, productViews: 16, threeDViews: 8, arLaunches: 4, cartAdds: 9, cartRemoves: 1, whatsappOrderInitiated: 5, abandonedCarts: 2, estimatedCartValue: 2200 }, disclaimer: "WhatsApp order activity is initiated, not a confirmed sale." };
    else if (path === "/api/jewellery/settings") data = { settings: { whatsappCountryCode: "+91", whatsappNumber: "919876543210", defaultEnquiryMessage: "", appointmentContact: "", productWebsite: "", storeAddress: "", businessHours: "", branchNumbers: [] } };
    else if (path === "/api/jewellery/enquiries") data = { items: [] };
    else if (path === "/api/jewellery/analytics") data = { summary: { TRY_ON_START: 3, PRICE_ENQUIRY_CLICK: 2, JEWELLERY_WHATSAPP_OPENED: 1 }, disclaimer: "Enquiries and WhatsApp opens are not confirmed sales." };
    else if (path === "/api/public/restaurant/menu/responsive-cafe") data = { business: { name: "Responsive Café", slug: "responsive-cafe", primaryColour: "#7C4A12", website: "" }, table: { id: "507f1f77bcf86cd799439020", number: "7", name: "Table 7", section: "Rooftop" }, sessionActive: true, settings: { currency: "INR", orderAvailability: "ACCEPTING", openingHours: "Daily, 10:00–23:00", orderInstructions: "Order directly from your table." }, categories: ["STARTERS", "MAIN_COURSE", "DESSERTS", "BEVERAGES", "BAKERY", "COMBOS", "SPECIALS"], items: [{ id: productId, name: "Margherita Pizza", slug: "margherita-pizza", description: "Stone-baked pizza with tomato, basil and mozzarella.", category: "MAIN_COURSE", productCategory: "Food", imageUrl: "", ingredients: ["Tomato", "Basil", "Mozzarella"], allergens: ["Milk", "Gluten"], vegetarian: true, vegan: false, spiceLevel: 1, availability: "AVAILABLE", servingInformation: "Serves one", approximateServingSize: "28 cm", price: 350, currency: "INR", view3dPath: "/ar-food/responsive-cafe/margherita-pizza" }] };
    else if (path === "/api/restaurant/cart") data = { cart: { orderId: "ORD-8F31C2", items: [], subtotal: 0, tax: 0, serviceCharge: 0, estimatedTotal: 0, currency: "INR", orderNote: "", customerName: "", status: "DRAFT" }, table: { id: "507f1f77bcf86cd799439020", number: "7", name: "Table 7" }, restaurant: { name: "Responsive Café", slug: "responsive-cafe" }, orderAvailability: "ACCEPTING" };
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

test("restaurant menu and sticky commerce actions remain usable on phones and landscape", async ({ page }) => {
  await mockAuthenticatedApis(page, "CUSTOMER");
  for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/menu/responsive-cafe?session=responsive-session-token-that-is-long-enough", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Margherita Pizza" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Order actions" })).toBeVisible();
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(sizes.scroll, `restaurant menu overflows at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(sizes.client);
    const targets = await page.locator(".commerce-sticky-bar button, .commerce-sticky-bar a").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(targets.every((height) => height >= 44)).toBe(true);
  }
});

test("every customer and administrator route stays inside all target widths", async ({ page }) => {
  test.setTimeout(600_000);
  const customerPaths = ["/dashboard", "/dashboard/business", "/dashboard/demo", "/dashboard/products", "/dashboard/products/new", `/dashboard/products/${productId}`, "/dashboard/uploads", "/dashboard/3d-generation", "/dashboard/models", "/dashboard/ar-experiences", "/dashboard/qr-codes", "/dashboard/approval-status", "/dashboard/custom-package", "/dashboard/payments", "/dashboard/analytics", "/dashboard/notifications", "/dashboard/support", "/dashboard/profile", "/dashboard/security", "/dashboard/settings", "/dashboard/restaurant/tables", "/dashboard/restaurant/tables/new", "/dashboard/restaurant/tables/507f1f77bcf86cd799439020", "/dashboard/restaurant/menu", "/dashboard/restaurant/orders", "/dashboard/restaurant/settings", "/dashboard/restaurant/analytics", "/dashboard/jewellery/enquiries", "/dashboard/jewellery/settings", "/dashboard/jewellery/analytics"];
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
