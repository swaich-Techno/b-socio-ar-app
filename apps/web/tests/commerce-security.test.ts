import { describe, expect, it } from "vitest";
import {
  buildJewelleryEnquiryMessage,
  buildRestaurantOrderMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppNumber,
} from "@/services/commerce/security";

describe("commerce WhatsApp security and messages", () => {
  it("normalizes business-owned phone numbers to international digits", () => {
    expect(normalizeWhatsAppNumber("+91", "09876 543 210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("+91", "+91 98765-43210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("", "001 415 555 0123")).toBe("14155550123");
  });

  it("rejects malformed phone-number injection", () => {
    expect(() => normalizeWhatsAppNumber("+91", "9876543210?text=<script>")).toThrow(/unsupported/i);
    expect(() => normalizeWhatsAppNumber("+91", "123")).toThrow(/8 to 15/i);
  });

  it("builds a table-aware restaurant message without claiming confirmation", () => {
    const message = buildRestaurantOrderMessage({
      restaurantName: "Café Example",
      tableName: "Table 7",
      orderId: "ORD-8F31C2",
      items: [{ productName: "Margherita Pizza", quantity: 2, unitPrice: 350, totalPrice: 700, instructions: "No onions" }],
      subtotal: 700,
      tax: 35,
      serviceCharge: 0,
      estimatedTotal: 735,
      currency: "INR",
      orderNote: "Serve drinks first",
      customerName: "Rahul",
    });
    expect(message).toContain("Table: Table 7");
    expect(message).toContain("Margherita Pizza × 2");
    expect(message).toContain("Note: No onions");
    expect(message).toContain("Estimated Total:");
    expect(message).not.toMatch(/order confirmed/i);
  });

  it("builds a jewellery enquiry with selections and an honest no-price prompt", () => {
    const message = buildJewelleryEnquiryMessage({
      businessName: "Royal Jewellery",
      productName: "Diamond Halo Ring",
      sku: "RH-2041",
      category: "Ring",
      metalType: "18K White Gold",
      stoneType: "Diamond",
      productUrl: "https://example.com/ar/royal/halo-ring",
      tryOnUrl: "https://example.com/try-on/royal/halo-ring",
      enquiryType: "PRICE_ENQUIRY",
      selectedHand: "LEFT",
      selectedFinger: "Ring Finger",
      selectedVariant: "White gold",
    });
    expect(message).toContain("SKU: RH-2041");
    expect(message).toContain("Selected Finger: Ring Finger");
    expect(message).toContain("Selected Hand: LEFT");
    expect(message).toContain("Please share the current price and availability.");
    expect(message).toContain("https://example.com/try-on/royal/halo-ring");
  });

  it("encodes message text and never permits a customer-selected phone path", () => {
    const url = buildWhatsAppUrl("919876543210", "Hello & <script>alert(1)</script>");
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(url).not.toContain("<script>");
    expect(() => buildWhatsAppUrl("919876543210/evil", "Hello")).toThrow();
  });
});
