import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type PaymentProviderName = "STRIPE" | "RAZORPAY" | "TEST";

export interface CheckoutInput {
  provider: PaymentProviderName;
  businessId: string;
  subscriptionId: string;
  customerEmail: string;
  currency: string;
  amount: number;
  billingPeriod: "MONTHLY" | "ANNUAL";
  description: string;
  providerPriceId?: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export interface CheckoutResult {
  provider: PaymentProviderName;
  checkoutId: string;
  providerSubscriptionId?: string;
  checkoutUrl: string;
  isTest: boolean;
}

export interface PaymentGateway {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
}

function getEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function safeEqualText(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

class TestGateway implements PaymentGateway {
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const checkoutId = `test_checkout_${randomUUID()}`;
    const url = new URL(input.successUrl);
    url.searchParams.set("testCheckout", checkoutId);
    return { provider: "TEST", checkoutId, checkoutUrl: url.toString(), isTest: true };
  }
}

class StripeGateway implements PaymentGateway {
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const secretKey = getEnv("STRIPE_SECRET_KEY");
    const body = new URLSearchParams({
      mode: input.providerPriceId ? "subscription" : "payment",
      "line_items[0][quantity]": "1",
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.businessId,
      "metadata[businessId]": input.businessId,
      "metadata[subscriptionId]": input.subscriptionId,
    });
    if (input.providerPriceId) {
      body.set("line_items[0][price]", input.providerPriceId);
      body.set("subscription_data[metadata][businessId]", input.businessId);
      body.set("subscription_data[metadata][subscriptionId]", input.subscriptionId);
    } else {
      body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
      body.set("line_items[0][price_data][unit_amount]", String(Math.round(input.amount * 100)));
      body.set("line_items[0][price_data][product_data][name]", input.description);
    }
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body,
    });
    const payload = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !payload.id || !payload.url) {
      throw new Error(payload.error?.message ?? "Stripe checkout creation failed.");
    }
    return { provider: "STRIPE", checkoutId: payload.id, checkoutUrl: payload.url, isTest: secretKey.startsWith("sk_test_") };
  }
}

class RazorpayGateway implements PaymentGateway {
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const keyId = getEnv("RAZORPAY_KEY_ID");
    const keySecret = getEnv("RAZORPAY_KEY_SECRET");
    const oneTime = !input.providerPriceId;
    const response = await fetch(oneTime ? "https://api.razorpay.com/v1/payment_links" : "https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "X-Razorpay-Account": process.env.RAZORPAY_ACCOUNT_ID?.trim() ?? "",
      },
      body: JSON.stringify(oneTime ? {
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        description: input.description,
        customer: { email: input.customerEmail },
        notify: { email: true },
        callback_url: input.successUrl,
        callback_method: "get",
        notes: { businessId: input.businessId, subscriptionId: input.subscriptionId, idempotencyKey: input.idempotencyKey },
      } : {
        plan_id: input.providerPriceId,
        total_count: input.billingPeriod === "ANNUAL" ? 10 : 120,
        customer_notify: 1,
        notes: { businessId: input.businessId, subscriptionId: input.subscriptionId, idempotencyKey: input.idempotencyKey },
      }),
    });
    const payload = await response.json() as { id?: string; short_url?: string; error?: { description?: string } };
    if (!response.ok || !payload.id || !payload.short_url) {
      throw new Error(payload.error?.description ?? "Razorpay checkout creation failed.");
    }
    return {
      provider: "RAZORPAY",
      checkoutId: payload.id,
      providerSubscriptionId: payload.id,
      checkoutUrl: payload.short_url,
      isTest: keyId.startsWith("rzp_test_"),
    };
  }
}

export function gatewayFor(provider: PaymentProviderName): PaymentGateway {
  if (provider === "STRIPE") return new StripeGateway();
  if (provider === "RAZORPAY") return new RazorpayGateway();
  return new TestGateway();
}

export function defaultProviderForRegion(region: string): PaymentProviderName {
  const testMode = process.env.BILLING_TEST_MODE !== "false";
  if (testMode) return "TEST";
  return region === "INDIA" ? "RAZORPAY" : "STRIPE";
}

export function validateStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret = process.env.STRIPE_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !secret) return false;
  const entries = signatureHeader.split(",").map((item) => item.trim().split("=", 2));
  const timestamp = entries.find(([key]) => key === "t")?.[1];
  const signatures = entries
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return signatures.some((signature) => safeEqualText(signature, expected));
}

export function validateRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret = process.env.RAZORPAY_WEBHOOK_SECRET,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqualText(signatureHeader, expected);
}
