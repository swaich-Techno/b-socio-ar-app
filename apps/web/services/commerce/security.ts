const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanMessageText(value: unknown, maxLength = 1000): string {
  return String(value ?? "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function normalizeWhatsAppNumber(countryCallingCode: string, number: string): string {
  const raw = cleanMessageText(number, 40);
  const rawCountry = cleanMessageText(countryCallingCode, 8);
  if (!/^[+\d\s().-]+$/.test(raw)) {
    throw new Error("WhatsApp number contains unsupported characters.");
  }
  if (rawCountry && !/^[+\d\s().-]+$/.test(rawCountry)) {
    throw new Error("Country calling code contains unsupported characters.");
  }
  const country = rawCountry.replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  const hadInternationalPrefix = raw.trim().startsWith("+") || raw.trim().startsWith("00");
  let normalized = hadInternationalPrefix
    ? digits.replace(/^00/, "")
    : `${country}${digits.replace(/^0+/, "")}`;

  if (country && normalized.startsWith(`${country}${country}`)) {
    normalized = normalized.slice(country.length);
  }
  if (!/^[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("WhatsApp number must contain 8 to 15 international-format digits.");
  }
  return normalized;
}

export function buildWhatsAppUrl(normalizedNumber: string, message: string): string {
  if (!/^[1-9]\d{7,14}$/.test(normalizedNumber)) {
    throw new Error("The business WhatsApp number is not configured correctly.");
  }
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(cleanMessageText(message, 8000))}`;
}

export function whatsappCallUrl(normalizedNumber: string): string {
  if (!/^[1-9]\d{7,14}$/.test(normalizedNumber)) {
    throw new Error("The business phone number is not configured correctly.");
  }
  return `tel:+${normalizedNumber}`;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export interface RestaurantOrderMessageInput {
  restaurantName: string;
  branchName?: string;
  tableName: string;
  orderId: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    instructions?: string;
  }>;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  estimatedTotal: number;
  currency: string;
  orderNote?: string;
  customerName?: string;
  timestamp?: Date;
  openingText?: string;
}

export function buildRestaurantOrderMessage(input: RestaurantOrderMessageInput): string {
  const lines = [
    cleanMessageText(input.openingText, 1000) || `Hello ${cleanMessageText(input.restaurantName, 160)},`,
    "",
    "I would like to place an order.",
    "",
    `Table: ${cleanMessageText(input.tableName, 120)}`,
    ...(input.branchName ? [`Branch: ${cleanMessageText(input.branchName, 120)}`] : []),
    `Order ID: ${cleanMessageText(input.orderId, 40)}`,
    "",
    "Items:",
  ];
  input.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${cleanMessageText(item.productName, 160)} × ${item.quantity} — ${formatMoney(item.totalPrice, input.currency)}`,
    );
    if (item.instructions) lines.push(`   Note: ${cleanMessageText(item.instructions, 500)}`);
    lines.push("");
  });
  lines.push(`Subtotal: ${formatMoney(input.subtotal, input.currency)}`);
  if (input.tax > 0) lines.push(`Tax: ${formatMoney(input.tax, input.currency)}`);
  if (input.serviceCharge > 0) lines.push(`Service charge: ${formatMoney(input.serviceCharge, input.currency)}`);
  lines.push(`Estimated Total: ${formatMoney(input.estimatedTotal, input.currency)}`);
  if (input.orderNote) lines.push("", "Order Note:", cleanMessageText(input.orderNote, 1000));
  if (input.customerName) lines.push("", `Customer Name: ${cleanMessageText(input.customerName, 120)}`);
  if (input.timestamp) lines.push(`Prepared: ${input.timestamp.toISOString()}`);
  return lines.join("\n").trim();
}

export interface JewelleryEnquiryMessageInput {
  businessName: string;
  productName: string;
  sku: string;
  category?: string;
  metalType?: string;
  stoneType?: string;
  productSize?: string;
  displayedPrice?: number;
  currency?: string;
  productUrl: string;
  tryOnUrl: string;
  enquiryType: string;
  selectedHand?: string;
  selectedFinger?: string;
  selectedVariant?: string;
  requestedSize?: string;
  preferredDate?: string;
  preferredTime?: string;
  customerName?: string;
  customerMobile?: string;
  customerCountryCode?: string;
  customerCountry?: string;
  customerTimezone?: string;
  branchName?: string;
  customerNote?: string;
  openingText?: string;
}

export function buildJewelleryEnquiryMessage(input: JewelleryEnquiryMessageInput): string {
  const typeLabels: Record<string, string> = {
    PRICE_ENQUIRY: "price enquiry",
    AVAILABILITY_ENQUIRY: "availability enquiry",
    CUSTOM_SIZE_REQUEST: "custom size request",
    STORE_VISIT: "store visit request",
    VIDEO_CALL: "video call request",
    DELIVERY_ENQUIRY: "delivery enquiry",
    PRODUCT_RESERVATION: "product reservation request",
    GENERAL_ENQUIRY: "product enquiry",
  };
  const lines = [
    cleanMessageText(input.openingText, 1000) || `Hello ${cleanMessageText(input.businessName, 160)},`,
    "",
    `I would like to make a ${typeLabels[input.enquiryType] ?? "product enquiry"}:`,
    "",
    `Product: ${cleanMessageText(input.productName, 160)}`,
    `SKU: ${cleanMessageText(input.sku, 120)}`,
  ];
  if (input.category) lines.push(`Category: ${cleanMessageText(input.category, 120)}`);
  if (input.metalType) lines.push(`Metal: ${cleanMessageText(input.metalType, 120)}`);
  if (input.stoneType) lines.push(`Stone: ${cleanMessageText(input.stoneType, 120)}`);
  if (input.productSize) lines.push(`Product Size: ${cleanMessageText(input.productSize, 120)}`);
  if (input.displayedPrice !== undefined) {
    lines.push(`Displayed Price: ${formatMoney(input.displayedPrice, input.currency ?? "INR")}`);
  } else {
    lines.push("Please share the current price and availability.");
  }
  if (input.selectedFinger) lines.push(`Selected Finger: ${cleanMessageText(input.selectedFinger, 80)}`);
  if (input.selectedHand) lines.push(`Selected Hand: ${cleanMessageText(input.selectedHand, 20)}`);
  if (input.selectedVariant) lines.push(`Selected Variant: ${cleanMessageText(input.selectedVariant, 120)}`);
  if (input.requestedSize) lines.push(`Required Size: ${cleanMessageText(input.requestedSize, 120)}`);
  if (input.preferredDate) lines.push(`Preferred Date: ${cleanMessageText(input.preferredDate, 20)}`);
  if (input.preferredTime) lines.push(`Preferred Time: ${cleanMessageText(input.preferredTime, 20)}`);
  if (input.customerName) lines.push(`Customer Name: ${cleanMessageText(input.customerName, 120)}`);
  if (input.customerMobile) {
    const customerNumber = [input.customerCountryCode, input.customerMobile].filter(Boolean).map((value) => cleanMessageText(value, 30)).join(" ");
    lines.push(`Customer Mobile: ${customerNumber}`);
  }
  if (input.customerCountry) lines.push(`Customer Country: ${cleanMessageText(input.customerCountry, 100)}`);
  if (input.customerTimezone) lines.push(`Customer Timezone: ${cleanMessageText(input.customerTimezone, 100)}`);
  if (input.branchName) lines.push(`Store Branch: ${cleanMessageText(input.branchName, 120)}`);
  if (input.customerNote) lines.push("", `Note: ${cleanMessageText(input.customerNote, 1000)}`);
  lines.push("", "Product Link:", input.productUrl, "", "Try-on Link:", input.tryOnUrl);
  lines.push("", "Please confirm availability, final price and next steps.");
  return lines.join("\n").trim();
}
