import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { NextRequest } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { createQrSvg } from "@bsocio/qr-engine";
import { requireAuth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getEnvironment } from "@/lib/env";
import { HttpError, ok, readJson } from "@/lib/http";
import {
  AnalyticsEvent,
  ArExperience,
  Asset,
  Business,
  CommerceProductProfile,
  DiningSession,
  JewelleryEnquiry,
  JewellerySettings,
  Product,
  RestaurantCart,
  RestaurantSettings,
  RestaurantTable,
} from "@/models";
import { requireOwnedBusiness } from "@/services/core";
import {
  buildJewelleryEnquiryMessage,
  buildRestaurantOrderMessage,
  buildWhatsAppUrl,
  normalizeWhatsAppNumber,
  whatsappCallUrl,
} from "./security";
import { optionalDiningSession, requireDiningSession } from "./session";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const tableInputSchema = z.object({
  tableNumber: z.string().trim().min(1).max(80),
  tableName: z.string().trim().min(1).max(120),
  branchId: z.string().trim().max(120).default("main"),
  section: z.string().trim().max(120).default(""),
  capacity: z.coerce.number().int().min(1).max(100),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  internalNotes: z.string().trim().max(2000).default(""),
}).strict();
const tableUpdateSchema = tableInputSchema.partial().extend({
  currentMenuDestination: z.string().trim().max(300).optional(),
}).strict();
const branchNumberSchema = z.object({
  branchId: z.string().trim().min(1).max(120),
  branchName: z.string().trim().max(120).default(""),
  countryCallingCode: z.string().trim().max(8).default(""),
  whatsappNumber: z.string().trim().max(40),
}).strict();
const restaurantSettingsSchema = z.object({
  whatsappCountryCode: z.string().trim().max(8).default(""),
  whatsappNumber: z.string().trim().max(40).default(""),
  defaultOrderLanguage: z.string().trim().min(2).max(12).default("en"),
  branchNumbers: z.array(branchNumberSchema).max(50).default([]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("INR"),
  taxPercentage: z.coerce.number().min(0).max(100).default(0),
  serviceChargePercentage: z.coerce.number().min(0).max(100).default(0),
  minimumOrderAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  orderAvailability: z.enum(["ACCEPTING", "TEMPORARILY_NOT_ACCEPTING", "CLOSED"]).default("TEMPORARILY_NOT_ACCEPTING"),
  defaultWhatsappMessage: z.string().trim().max(1000).default(""),
  tableNumberingFormat: z.string().trim().max(120).default("Table {number}"),
  menuLanguages: z.array(z.string().trim().min(2).max(12)).max(20).default(["en"]),
  orderInstructions: z.string().trim().max(2000).default(""),
  openingHours: z.string().trim().max(2000).default(""),
}).strict();
const jewellerySettingsSchema = z.object({
  whatsappCountryCode: z.string().trim().max(8).default(""),
  whatsappNumber: z.string().trim().max(40).default(""),
  branchNumbers: z.array(branchNumberSchema).max(50).default([]),
  defaultEnquiryMessage: z.string().trim().max(1000).default(""),
  appointmentContact: z.string().trim().max(100).default(""),
  productWebsite: z.union([z.literal(""), z.string().url().max(500)]).default(""),
  storeAddress: z.string().trim().max(1000).default(""),
  businessHours: z.string().trim().max(2000).default(""),
}).strict();
const restaurantProductProfileSchema = z.object({
  menuCategory: z.enum(["STARTERS", "MAIN_COURSE", "DESSERTS", "BEVERAGES", "BAKERY", "COMBOS", "SPECIALS"]),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  allergens: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  vegetarian: z.boolean().default(false),
  vegan: z.boolean().default(false),
  spiceLevel: z.coerce.number().int().min(0).max(5).default(0),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE", "HIDDEN"]).default("AVAILABLE"),
  showWhenUnavailable: z.boolean().default(true),
  servingInformation: z.string().trim().max(500).default(""),
  approximateServingSize: z.string().trim().max(200).default(""),
  imageUrl: z.union([z.literal(""), z.string().url().max(1000)]).default(""),
}).strict();
const cartItemSchema = z.object({
  productId: objectId,
  quantity: z.coerce.number().int().min(0).max(99),
  instructions: z.string().trim().max(500).default(""),
}).strict();
const cartDetailsSchema = z.object({
  orderNote: z.string().trim().max(1000).default(""),
  customerName: z.string().trim().max(120).default(""),
}).strict();
const enquiryType = z.enum([
  "PRICE_ENQUIRY",
  "AVAILABILITY_ENQUIRY",
  "CUSTOM_SIZE_REQUEST",
  "STORE_VISIT",
  "VIDEO_CALL",
  "DELIVERY_ENQUIRY",
  "PRODUCT_RESERVATION",
  "GENERAL_ENQUIRY",
]);
const jewelleryEnquirySchema = z.object({
  businessSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  productSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  enquiryType,
  branchId: z.string().trim().max(120).default("main"),
  branchName: z.string().trim().max(120).default(""),
  tryOnProfileId: z.string().trim().max(160).default(""),
  customerName: z.string().trim().max(120).default(""),
  customerMobile: z.string().trim().max(20).default(""),
  customerCountryCode: z.string().trim().max(6).default(""),
  customerCountry: z.string().trim().max(100).default(""),
  customerTimezone: z.string().trim().max(100).default(""),
  selectedHand: z.enum(["", "LEFT", "RIGHT"]).default(""),
  selectedFinger: z.string().trim().max(80).default(""),
  selectedVariant: z.string().trim().max(120).default(""),
  requestedSize: z.string().trim().max(120).default(""),
  preferredDate: z.string().trim().max(20).default(""),
  preferredTime: z.string().trim().max(20).default(""),
  customerNote: z.string().trim().max(1000).default(""),
}).strict();
const analyticsSchema = z.object({
  eventType: z.enum([
    "MENU_VIEW", "PRODUCT_VIEW", "THREE_D_VIEW", "AR_LAUNCH", "CART_ADD", "CART_REMOVE",
    "TRY_ON_START", "FRONT_CAMERA_TRY_ON", "REAR_CAMERA_TRY_ON", "TRY_ON_DURATION", "SCREENSHOT_CAPTURE",
    "PRODUCT_FAVOURITE",
  ]),
  productId: objectId.optional(),
  durationSeconds: z.coerce.number().min(0).max(86_400).optional(),
}).strict();

function tableCode() {
  return randomBytes(12).toString("base64url");
}

function orderCode() {
  return `ORD-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function priceRound(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function ownedBusiness(request: NextRequest) {
  const auth = await requireAuth(request, ["CUSTOMER"]);
  const business = await requireOwnedBusiness(auth);
  return { auth, business };
}

function safeTable(table: Record<string, unknown>) {
  const publicFields = { ...table };
  delete publicFields.internalNotes;
  return publicFields;
}

function getBusinessNumber(
  settings: { whatsappNumber?: string; branchNumbers?: Array<{ branchId?: string; whatsappNumber?: string }> } | null,
  branchId: string,
) {
  const branchNumber = settings?.branchNumbers?.find((item) => item.branchId === branchId)?.whatsappNumber;
  return branchNumber || settings?.whatsappNumber || "";
}

function recalculateCart(cart: {
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number }>;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  estimatedTotal: number;
  currency: string;
}, settings: { taxPercentage?: number; serviceChargePercentage?: number; currency?: string } | null) {
  for (const item of cart.items) item.totalPrice = priceRound(item.quantity * item.unitPrice);
  cart.subtotal = priceRound(cart.items.reduce((sum, item) => sum + item.totalPrice, 0));
  cart.tax = priceRound(cart.subtotal * (Number(settings?.taxPercentage ?? 0) / 100));
  cart.serviceCharge = priceRound(cart.subtotal * (Number(settings?.serviceChargePercentage ?? 0) / 100));
  cart.estimatedTotal = priceRound(cart.subtotal + cart.tax + cart.serviceCharge);
  cart.currency = settings?.currency || cart.currency || "INR";
}

async function getOrCreateCart(session: { _id: Types.ObjectId; businessId: Types.ObjectId; branchId: string; tableId: Types.ObjectId }) {
  let cart = await RestaurantCart.findOne({ diningSessionId: session._id });
  if (!cart) {
    cart = await RestaurantCart.create({
      businessId: session.businessId,
      branchId: session.branchId,
      tableId: session.tableId,
      diningSessionId: session._id,
      orderId: orderCode(),
      items: [],
      currency: "INR",
      status: "DRAFT",
    });
  }
  return cart;
}

async function publicMenu(request: NextRequest, businessSlug: string) {
  await dbConnect();
  const business = await Business.findOne({ slug: businessSlug, status: "ACTIVE" });
  if (!business) throw new HttpError(404, "MENU_NOT_FOUND", "This restaurant menu is not available.");
  const sessionContext = await optionalDiningSession(request, business._id.toString());
  const settings = await RestaurantSettings.findOne({ businessId: business._id });
  const publishedExperiences = await ArExperience.find({ businessId: business._id, status: "PUBLISHED" }).select("productId").lean();
  const productIds = publishedExperiences.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds }, businessId: business._id }).sort({ category: 1, name: 1 }).lean();
  const profiles = await CommerceProductProfile.find({ productId: { $in: productIds }, kind: "RESTAURANT" }).lean();
  const profileMap = new Map(profiles.map((profile) => [String(profile.productId), profile]));
  const assetIds = products.map((product) => product.mainImageAssetId).filter(Boolean);
  const assets = await Asset.find({ _id: { $in: assetIds }, visibility: "PUBLIC_APPROVED", status: "VALIDATED" }).select("metadata").lean();
  const assetMap = new Map(assets.map((asset) => [String(asset._id), asset]));
  const publicDomain = getEnvironment().R2_PUBLIC_DOMAIN?.replace(/\/$/, "");
  const menuItems = products.flatMap((product) => {
    const profile = profileMap.get(String(product._id));
    const availability = profile?.availability ?? "AVAILABLE";
    if (availability === "HIDDEN" || (availability === "UNAVAILABLE" && profile?.showWhenUnavailable === false)) return [];
    const asset = product.mainImageAssetId ? assetMap.get(String(product.mainImageAssetId)) : undefined;
    const publicKey = typeof asset?.metadata?.publicKey === "string" ? asset.metadata.publicKey : "";
    return [{
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      description: product.description,
      category: profile?.menuCategory ?? "SPECIALS",
      productCategory: product.category,
      imageUrl: profile?.imageUrl || (publicDomain && publicKey ? `${publicDomain}/${publicKey}` : ""),
      ingredients: profile?.ingredients ?? [],
      allergens: profile?.allergens ?? [],
      vegetarian: profile?.vegetarian ?? false,
      vegan: profile?.vegan ?? false,
      spiceLevel: profile?.spiceLevel ?? 0,
      availability,
      servingInformation: profile?.servingInformation ?? "",
      approximateServingSize: profile?.approximateServingSize ?? "",
      price: product.price,
      currency: product.currency || settings?.currency || "INR",
      view3dPath: `/ar-food/${business.slug}/${product.slug}`,
    }];
  });
  await AnalyticsEvent.create({
    businessId: business._id,
    eventType: "MENU_VIEW",
    sessionHash: sessionContext?.session.sessionTokenHash,
    metadata: sessionContext ? { tableId: String(sessionContext.table._id) } : {},
  }).catch((error) => console.error("Menu analytics write failed", error));
  return ok({
    business: {
      name: business.name,
      slug: business.slug,
      primaryColour: business.primaryColour,
      website: business.website || "",
    },
    table: sessionContext ? {
      id: String(sessionContext.table._id),
      number: sessionContext.table.tableNumber,
      name: sessionContext.table.tableName,
      section: sessionContext.table.section,
    } : null,
    sessionActive: Boolean(sessionContext),
    settings: {
      currency: settings?.currency ?? "INR",
      orderAvailability: settings?.orderAvailability ?? "TEMPORARILY_NOT_ACCEPTING",
      openingHours: settings?.openingHours ?? "",
      orderInstructions: settings?.orderInstructions ?? "",
    },
    categories: ["STARTERS", "MAIN_COURSE", "DESSERTS", "BEVERAGES", "BAKERY", "COMBOS", "SPECIALS"],
    items: menuItems,
  });
}

async function getRestaurantCart(request: NextRequest) {
  const context = await requireDiningSession(request);
  const settings = await RestaurantSettings.findOne({ businessId: context.business._id });
  const cart = await getOrCreateCart(context.session);
  recalculateCart(cart, settings);
  await cart.save();
  return ok({
    cart,
    table: { id: String(context.table._id), number: context.table.tableNumber, name: context.table.tableName },
    restaurant: { name: context.business.name, slug: context.business.slug },
    orderAvailability: settings?.orderAvailability ?? "TEMPORARILY_NOT_ACCEPTING",
  });
}

async function listMenuItems(request: NextRequest) {
  const { business } = await ownedBusiness(request);
  const products = await Product.find({ businessId: business._id }).sort({ name: 1 }).lean();
  const profiles = await CommerceProductProfile.find({ businessId: business._id, kind: "RESTAURANT" }).lean();
  const profileMap = new Map(profiles.map((profile) => [String(profile.productId), profile]));
  return ok({
    items: products.map((product) => ({
      product: {
        id: String(product._id), name: product.name, slug: product.slug, description: product.description,
        category: product.category, price: product.price, currency: product.currency,
      },
      profile: profileMap.get(String(product._id)) ?? null,
    })),
  });
}

async function listRestaurantTables(request: NextRequest) {
  const { business } = await ownedBusiness(request);
  const items = await RestaurantTable.find({ businessId: business._id }).select("+internalNotes").sort({ branchId: 1, tableNumber: 1 }).lean();
  return ok({ items });
}

async function restaurantTableDetail(request: NextRequest, tableId: string) {
  const { business } = await ownedBusiness(request);
  const table = await RestaurantTable.findOne({ _id: tableId, businessId: business._id }).select("+internalNotes").lean();
  if (!table) throw new HttpError(404, "TABLE_NOT_FOUND", "Restaurant table not found.");
  return ok({ table });
}

async function renderTableQr(request: NextRequest, tableId: string) {
  const { business } = await ownedBusiness(request);
  const table = await RestaurantTable.findOne({ _id: tableId, businessId: business._id });
  if (!table) throw new HttpError(404, "TABLE_NOT_FOUND", "Restaurant table not found.");
  const format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "svg";
  const content = `${getEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/q/table/${table.uniqueQrCode}`;
  const foreground = /^#[0-9A-F]{6}$/i.test(business.primaryColour) ? business.primaryColour : "#1C1917";
  const filename = `table-${String(table.tableNumber).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.${format}`;
  if (format === "svg") {
    return new Response(createQrSvg(content, { foreground, background: "#FFFFFF", size: 1024, errorCorrectionLevel: "H" }), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const buffer = await QRCode.toBuffer(content, {
    type: "png",
    width: 2048,
    margin: 6,
    errorCorrectionLevel: "H",
    color: { dark: foreground, light: "#FFFFFF" },
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function restaurantAnalytics(request: NextRequest) {
  const { business } = await ownedBusiness(request);
  const [
    tableScans, uniqueSessions, menuViews, productViews, threeDViews, arLaunches,
    cartAdds, cartRemoves, whatsappClicks, abandonedCarts, value, popularProducts, popularTables, peakTimes,
  ] = await Promise.all([
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "TABLE_QR_SCAN" }),
    DiningSession.countDocuments({ businessId: business._id }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "MENU_VIEW" }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "PRODUCT_VIEW" }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "THREE_D_VIEW" }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "AR_LAUNCH" }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "CART_ADD" }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "CART_REMOVE" }),
    AnalyticsEvent.countDocuments({ businessId: business._id, eventType: "WHATSAPP_ORDER_CLICK" }),
    RestaurantCart.countDocuments({ businessId: business._id, status: "DRAFT", updatedAt: { $lt: new Date(Date.now() - 30 * 60_000) } }),
    RestaurantCart.aggregate([{ $match: { businessId: business._id, status: { $in: ["READY_FOR_WHATSAPP", "WHATSAPP_OPENED", "CUSTOMER_MARKED_SENT"] } } }, { $group: { _id: null, total: { $sum: "$estimatedTotal" } } }]),
    AnalyticsEvent.aggregate([{ $match: { businessId: business._id, productId: { $ne: null }, eventType: { $in: ["CART_ADD", "PRODUCT_VIEW"] } } }, { $group: { _id: "$productId", interactions: { $sum: 1 } } }, { $sort: { interactions: -1 } }, { $limit: 5 }]),
    RestaurantTable.find({ businessId: business._id }).select("tableName tableNumber scanCount").sort({ scanCount: -1 }).limit(5).lean(),
    AnalyticsEvent.aggregate([{ $match: { businessId: business._id, eventType: "WHATSAPP_ORDER_CLICK" } }, { $group: { _id: { $hour: "$occurredAt" }, initiated: { $sum: 1 } } }, { $sort: { initiated: -1 } }, { $limit: 6 }]),
  ]);
  const products = await Product.find({ _id: { $in: popularProducts.map((item) => item._id) } }).select("name").lean();
  const productNames = new Map(products.map((item) => [String(item._id), item.name]));
  return ok({
    summary: { tableScans, uniqueSessions, menuViews, productViews, threeDViews, arLaunches, cartAdds, cartRemoves, whatsappOrderInitiated: whatsappClicks, abandonedCarts, estimatedCartValue: value[0]?.total ?? 0 },
    popularProducts: popularProducts.map((item) => ({ productId: String(item._id), name: productNames.get(String(item._id)) ?? "Product", interactions: item.interactions })),
    popularTables,
    peakTimes,
    disclaimer: "WhatsApp order activity is initiated, not a confirmed sale.",
  });
}

async function jewelleryAnalytics(request: NextRequest) {
  const { business } = await ownedBusiness(request);
  const types = [
    "PRODUCT_QR_SCAN", "PRODUCT_VIEW", "TRY_ON_START", "FRONT_CAMERA_TRY_ON", "REAR_CAMERA_TRY_ON", "TRY_ON_DURATION",
    "SCREENSHOT_CAPTURE", "PRICE_ENQUIRY_CLICK", "AVAILABILITY_ENQUIRY_CLICK", "STORE_VISIT_CLICK",
    "VIDEO_CALL_CLICK", "JEWELLERY_WHATSAPP_OPENED", "PRODUCT_FAVOURITE",
  ];
  const [totals, durationStats] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { businessId: business._id, eventType: { $in: types } } },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { businessId: business._id, eventType: "TRY_ON_DURATION" } },
      { $group: { _id: null, total: { $sum: "$metadata.durationSeconds" }, average: { $avg: "$metadata.durationSeconds" } } },
    ]),
  ]);
  const summary = Object.fromEntries(types.map((type) => [type, totals.find((item) => item._id === type)?.count ?? 0]));
  summary.TRY_ON_DURATION_SECONDS = Math.round(durationStats[0]?.total ?? 0);
  summary.AVERAGE_TRY_ON_DURATION_SECONDS = Math.round(durationStats[0]?.average ?? 0);
  const popular = await JewelleryEnquiry.aggregate([
    { $match: { businessId: business._id } },
    { $group: { _id: "$productId", enquiries: { $sum: 1 } } },
    { $sort: { enquiries: -1 } },
    { $limit: 5 },
  ]);
  const products = await Product.find({ _id: { $in: popular.map((item) => item._id) } }).select("name").lean();
  const names = new Map(products.map((item) => [String(item._id), item.name]));
  return ok({
    summary,
    mostEnquiredProducts: popular.map((item) => ({ productId: String(item._id), name: names.get(String(item._id)) ?? "Product", enquiries: item.enquiries })),
    disclaimer: "Enquiries and WhatsApp opens are not confirmed sales.",
  });
}

export async function handleCommerceGet(request: NextRequest, path: string): Promise<Response | null> {
  if (path === "restaurant/tables") return listRestaurantTables(request);
  const tableQrMatch = path.match(/^restaurant\/tables\/([a-f\d]{24})\/qr$/i);
  if (tableQrMatch) return renderTableQr(request, tableQrMatch[1]!);
  const tableMatch = path.match(/^restaurant\/tables\/([a-f\d]{24})$/i);
  if (tableMatch) return restaurantTableDetail(request, tableMatch[1]!);
  if (path === "restaurant/settings") {
    const { business } = await ownedBusiness(request);
    return ok({ settings: await RestaurantSettings.findOne({ businessId: business._id }).lean() });
  }
  if (path === "restaurant/menu-items") return listMenuItems(request);
  if (path === "restaurant/cart") return getRestaurantCart(request);
  if (path === "restaurant/dining-sessions" || path === "restaurant/dining-sessions/current") {
    const context = await requireDiningSession(request);
    return ok({
      session: { id: String(context.session._id), expiresAt: context.session.expiresAt },
      table: safeTable(context.table.toObject()),
      business: { name: context.business.name, slug: context.business.slug },
    });
  }
  if (path === "restaurant/orders") {
    const { business } = await ownedBusiness(request);
    const items = await RestaurantCart.find({ businessId: business._id }).sort({ updatedAt: -1 }).limit(200).lean();
    const tables = await RestaurantTable.find({ _id: { $in: items.map((item) => item.tableId) } }).select("tableName tableNumber").lean();
    const tableMap = new Map(tables.map((table) => [String(table._id), table]));
    return ok({ items: items.map((item) => ({ ...item, table: tableMap.get(String(item.tableId)) ?? null })) });
  }
  if (path === "restaurant/analytics") return restaurantAnalytics(request);
  if (path.startsWith("public/restaurant/menu/")) return publicMenu(request, path.slice("public/restaurant/menu/".length));
  if (path === "jewellery/settings") {
    const { business } = await ownedBusiness(request);
    return ok({ settings: await JewellerySettings.findOne({ businessId: business._id }).lean() });
  }
  if (path === "jewellery/enquiries") {
    const { business } = await ownedBusiness(request);
    return ok({ items: await JewelleryEnquiry.find({ businessId: business._id }).select("-generatedMessage").sort({ createdAt: -1 }).limit(200).lean() });
  }
  if (path === "jewellery/analytics") return jewelleryAnalytics(request);
  return null;
}

async function createRestaurantTable(request: NextRequest) {
  const input = await readJson(request, tableInputSchema);
  const { business } = await ownedBusiness(request);
  const qrCodeId = new Types.ObjectId();
  const table = await RestaurantTable.create({
    businessId: business._id,
    ...input,
    uniqueQrCode: tableCode(),
    qrCodeId,
    currentMenuDestination: `/menu/${business.slug}`,
    qrCreatedAt: new Date(),
  });
  return ok({ table }, 201);
}

async function addCartItem(request: NextRequest) {
  const input = await readJson(request, cartItemSchema);
  const context = await requireDiningSession(request);
  const [product, profile, settings] = await Promise.all([
    Product.findOne({ _id: input.productId, businessId: context.business._id }),
    CommerceProductProfile.findOne({ productId: input.productId, businessId: context.business._id, kind: "RESTAURANT" }),
    RestaurantSettings.findOne({ businessId: context.business._id }),
  ]);
  if (!product) throw new HttpError(404, "MENU_ITEM_NOT_FOUND", "This menu item is not available.");
  if (profile?.availability && profile.availability !== "AVAILABLE") {
    throw new HttpError(409, "MENU_ITEM_UNAVAILABLE", "This menu item is currently unavailable.");
  }
  if (typeof product.price !== "number") {
    throw new HttpError(409, "MENU_ITEM_PRICE_REQUIRED", "This menu item does not have an orderable price.");
  }
  const cart = await getOrCreateCart(context.session);
  const existing = cart.items.find((item: { productId: { toString(): string } }) => item.productId.toString() === input.productId);
  const removed = input.quantity === 0;
  if (removed) {
    cart.items = cart.items.filter((item: { productId: { toString(): string } }) => item.productId.toString() !== input.productId);
  } else if (existing) {
    existing.quantity = input.quantity;
    existing.instructions = input.instructions;
  } else {
    cart.items.push({
      productId: product._id,
      productNameSnapshot: product.name,
      quantity: input.quantity,
      unitPrice: product.price,
      totalPrice: priceRound(product.price * input.quantity),
      instructions: input.instructions,
    });
  }
  cart.status = "DRAFT";
  recalculateCart(cart, settings);
  await cart.save();
  await AnalyticsEvent.create({
    businessId: context.business._id,
    productId: product._id,
    eventType: removed ? "CART_REMOVE" : "CART_ADD",
    metadata: { tableId: String(context.table._id), quantity: input.quantity, estimatedCartValue: cart.estimatedTotal },
  }).catch((error) => console.error("Cart analytics write failed", error));
  return ok({ cart });
}

async function prepareRestaurantWhatsapp(request: NextRequest) {
  const input = await readJson(request, cartDetailsSchema);
  const context = await requireDiningSession(request);
  const [settings, cart] = await Promise.all([
    RestaurantSettings.findOne({ businessId: context.business._id }),
    RestaurantCart.findOne({ diningSessionId: context.session._id }),
  ]);
  if (!settings) throw new HttpError(409, "RESTAURANT_SETTINGS_REQUIRED", "The restaurant has not configured WhatsApp ordering.");
  if (settings.orderAvailability !== "ACCEPTING") {
    throw new HttpError(409, "ORDERS_UNAVAILABLE", settings.orderAvailability === "CLOSED" ? "The restaurant is closed." : "The restaurant is temporarily not accepting WhatsApp orders.");
  }
  if (!cart || cart.items.length === 0) throw new HttpError(409, "CART_EMPTY", "Add at least one item before preparing the order.");
  cart.orderNote = input.orderNote;
  cart.customerName = input.customerName;
  recalculateCart(cart, settings);
  if (cart.estimatedTotal < Number(settings.minimumOrderAmount ?? 0)) {
    throw new HttpError(409, "MINIMUM_ORDER_NOT_MET", `The minimum order is ${settings.currency} ${settings.minimumOrderAmount}.`);
  }
  const number = getBusinessNumber(settings, context.session.branchId);
  if (!number) throw new HttpError(409, "WHATSAPP_NOT_CONFIGURED", "The restaurant has not configured a WhatsApp order number.");
  const message = buildRestaurantOrderMessage({
    restaurantName: context.business.name,
    branchName: context.session.branchId !== "main" ? context.session.branchId : undefined,
    tableName: context.table.tableName,
    orderId: cart.orderId,
    items: cart.items.map((item: { productNameSnapshot: string; quantity: number; unitPrice: number; totalPrice: number; instructions?: string }) => ({
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      instructions: item.instructions,
    })),
    subtotal: cart.subtotal,
    tax: cart.tax,
    serviceCharge: cart.serviceCharge,
    estimatedTotal: cart.estimatedTotal,
    currency: cart.currency,
    orderNote: cart.orderNote,
    customerName: cart.customerName,
    timestamp: new Date(),
    openingText: settings.defaultWhatsappMessage,
  });
  cart.status = "WHATSAPP_OPENED";
  cart.whatsappOpenedAt = new Date();
  await cart.save();
  await AnalyticsEvent.create({
    businessId: context.business._id,
    eventType: "WHATSAPP_ORDER_CLICK",
    metadata: { tableId: String(context.table._id), cartId: String(cart._id), orderId: cart.orderId, estimatedCartValue: cart.estimatedTotal },
  }).catch((error) => console.error("WhatsApp order analytics write failed", error));
  return ok({
    status: "WHATSAPP_OPENED",
    statusLabel: "WhatsApp order initiated",
    whatsappUrl: buildWhatsAppUrl(number, message),
    callUrl: whatsappCallUrl(number),
    phoneNumber: `+${number}`,
    message,
    orderId: cart.orderId,
    notice: "Your order details are ready. WhatsApp will open so you can send the order directly to the restaurant.",
  });
}

async function recordCommerceAnalytics(request: NextRequest, kind: "restaurant" | "jewellery") {
  const input = await readJson(request, analyticsSchema);
  await dbConnect();
  let businessId: string;
  let tableId: string | undefined;
  if (kind === "restaurant") {
    const context = await requireDiningSession(request);
    businessId = String(context.business._id);
    tableId = String(context.table._id);
  } else {
    const url = new URL(request.url);
    const slug = url.searchParams.get("businessSlug") ?? "";
    const business = await Business.findOne({ slug, status: "ACTIVE" });
    if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Business not found.");
    businessId = String(business._id);
  }
  if (input.productId && !(await Product.exists({ _id: input.productId, businessId }))) {
    throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  }
  await AnalyticsEvent.create({ businessId, productId: input.productId, eventType: input.eventType, metadata: { tableId, durationSeconds: input.durationSeconds } });
  return ok({ recorded: true }, 201);
}

async function createJewelleryEnquiry(request: NextRequest, openWhatsapp: boolean) {
  const input = await readJson(request, jewelleryEnquirySchema);
  await dbConnect();
  const business = await Business.findOne({ slug: input.businessSlug, status: "ACTIVE" });
  if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Jewellery business not found.");
  const product = await Product.findOne({ businessId: business._id, slug: input.productSlug });
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Jewellery product not found.");
  const [profile, settings] = await Promise.all([
    CommerceProductProfile.findOne({ businessId: business._id, productId: product._id, kind: "JEWELLERY" }),
    JewellerySettings.findOne({ businessId: business._id }),
  ]);
  const configuredBranch = settings?.branchNumbers?.find((branch: { branchId?: string; branchName?: string }) => branch.branchId === input.branchId);
  const baseUrl = getEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const message = buildJewelleryEnquiryMessage({
    businessName: business.name,
    productName: product.name,
    sku: profile?.sku || product.slug.toUpperCase(),
    category: profile?.jewelleryCategory || product.category,
    metalType: profile?.metalType || product.material,
    stoneType: profile?.stoneType,
    productSize: profile?.productSize,
    displayedPrice: product.price,
    currency: product.currency,
    productUrl: `${baseUrl}/ar/${business.slug}/${product.slug}`,
    tryOnUrl: `${baseUrl}/try-on/${business.slug}/${product.slug}`,
    ...input,
    branchName: configuredBranch?.branchName || (input.branchId !== "main" ? input.branchId : ""),
    openingText: settings?.defaultEnquiryMessage,
  });
  let number = getBusinessNumber(settings, input.branchId ?? "main");
  if (!number && business.whatsapp) {
    try { number = normalizeWhatsAppNumber("", business.whatsapp); } catch { number = ""; }
  }
  const whatsappUrl = openWhatsapp && number ? buildWhatsAppUrl(number, message) : "";
  const status = whatsappUrl ? "WHATSAPP_OPENED" : openWhatsapp ? "READY_FOR_WHATSAPP" : "DRAFT";
  const enquiry = await JewelleryEnquiry.create({
    businessId: business._id,
    productId: product._id,
    ...input,
    generatedMessage: message,
    status,
    whatsappOpenedAt: whatsappUrl ? new Date() : undefined,
  });
  const eventByType: Record<string, string> = {
    PRICE_ENQUIRY: "PRICE_ENQUIRY_CLICK",
    AVAILABILITY_ENQUIRY: "AVAILABILITY_ENQUIRY_CLICK",
    STORE_VISIT: "STORE_VISIT_CLICK",
    VIDEO_CALL: "VIDEO_CALL_CLICK",
  };
  await Promise.all([
    AnalyticsEvent.create({ businessId: business._id, productId: product._id, eventType: eventByType[input.enquiryType] ?? "JEWELLERY_ENQUIRY_INITIATED", metadata: { enquiryId: String(enquiry._id), enquiryType: input.enquiryType } }),
    ...(whatsappUrl ? [AnalyticsEvent.create({ businessId: business._id, productId: product._id, eventType: "JEWELLERY_WHATSAPP_OPENED", metadata: { enquiryId: String(enquiry._id), enquiryType: input.enquiryType } })] : []),
  ]).catch((error) => console.error("Jewellery enquiry analytics write failed", error));
  return ok({
    enquiryId: String(enquiry._id),
    status,
    statusLabel: whatsappUrl ? "WhatsApp opened" : "Enquiry initiated",
    whatsappUrl: whatsappUrl || undefined,
    callUrl: number ? whatsappCallUrl(number) : undefined,
    phoneNumber: number ? `+${number}` : undefined,
    websiteUrl: settings?.productWebsite || business.website || undefined,
    message,
    instruction: "You may attach your saved try-on image in WhatsApp.",
  }, 201);
}

export async function handleCommercePost(request: NextRequest, path: string): Promise<Response | null> {
  if (path === "restaurant/tables") return createRestaurantTable(request);
  if (path === "restaurant/cart/items") return addCartItem(request);
  if (path === "restaurant/cart/whatsapp") return prepareRestaurantWhatsapp(request);
  if (path === "restaurant/analytics") return recordCommerceAnalytics(request, "restaurant");
  if (path === "jewellery/enquiries") return createJewelleryEnquiry(request, false);
  if (path === "jewellery/enquiries/whatsapp") return createJewelleryEnquiry(request, true);
  if (path === "jewellery/analytics") return recordCommerceAnalytics(request, "jewellery");
  return null;
}

async function updateRestaurantTable(request: NextRequest, tableId: string) {
  const input = await readJson(request, tableUpdateSchema);
  const { business } = await ownedBusiness(request);
  if (input.currentMenuDestination && !input.currentMenuDestination.startsWith(`/menu/${business.slug}`)) {
    throw new HttpError(422, "TABLE_DESTINATION_INVALID", "The table QR destination must stay inside this restaurant menu.");
  }
  const table = await RestaurantTable.findOneAndUpdate(
    { _id: tableId, businessId: business._id },
    { $set: input },
    { new: true, runValidators: true },
  ).select("+internalNotes");
  if (!table) throw new HttpError(404, "TABLE_NOT_FOUND", "Restaurant table not found.");
  return ok({ table });
}

async function saveRestaurantSettings(request: NextRequest) {
  const input = await readJson(request, restaurantSettingsSchema);
  const { business } = await ownedBusiness(request);
  const whatsappNumber = input.whatsappNumber
    ? normalizeWhatsAppNumber(input.whatsappCountryCode ?? "", input.whatsappNumber)
    : "";
  const branchNumbers = (input.branchNumbers ?? []).map((branch) => ({
    branchId: branch.branchId,
    branchName: branch.branchName,
    whatsappNumber: normalizeWhatsAppNumber(branch.countryCallingCode ?? "", branch.whatsappNumber),
  }));
  const settings = await RestaurantSettings.findOneAndUpdate(
    { businessId: business._id },
    { $set: { ...input, whatsappNumber, branchNumbers } },
    { upsert: true, new: true, runValidators: true },
  );
  return ok({ settings });
}

async function saveJewellerySettings(request: NextRequest) {
  const input = await readJson(request, jewellerySettingsSchema);
  const { business } = await ownedBusiness(request);
  const whatsappNumber = input.whatsappNumber
    ? normalizeWhatsAppNumber(input.whatsappCountryCode ?? "", input.whatsappNumber)
    : "";
  const branchNumbers = (input.branchNumbers ?? []).map((branch) => ({
    branchId: branch.branchId,
    branchName: branch.branchName,
    whatsappNumber: normalizeWhatsAppNumber(branch.countryCallingCode ?? "", branch.whatsappNumber),
  }));
  const settings = await JewellerySettings.findOneAndUpdate(
    { businessId: business._id },
    { $set: { ...input, whatsappNumber, branchNumbers } },
    { upsert: true, new: true, runValidators: true },
  );
  return ok({ settings });
}

async function saveRestaurantProductProfile(request: NextRequest, productId: string) {
  const input = await readJson(request, restaurantProductProfileSchema);
  const { business } = await ownedBusiness(request);
  const product = await Product.findOne({ _id: productId, businessId: business._id });
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const profile = await CommerceProductProfile.findOneAndUpdate(
    { productId: product._id, businessId: business._id },
    { $set: { ...input, kind: "RESTAURANT" } },
    { upsert: true, new: true, runValidators: true },
  );
  return ok({ profile });
}

async function saveCartDetails(request: NextRequest) {
  const input = await readJson(request, cartDetailsSchema);
  const context = await requireDiningSession(request);
  const cart = await getOrCreateCart(context.session);
  cart.orderNote = input.orderNote;
  cart.customerName = input.customerName;
  cart.status = "DRAFT";
  await cart.save();
  return ok({ cart });
}

export async function handleCommercePatch(request: NextRequest, path: string): Promise<Response | null> {
  const tableMatch = path.match(/^restaurant\/tables\/([a-f\d]{24})$/i);
  if (tableMatch) return updateRestaurantTable(request, tableMatch[1]!);
  if (path === "restaurant/settings") return saveRestaurantSettings(request);
  if (path === "jewellery/settings") return saveJewellerySettings(request);
  const menuItemMatch = path.match(/^restaurant\/menu-items\/([a-f\d]{24})$/i);
  if (menuItemMatch) return saveRestaurantProductProfile(request, menuItemMatch[1]!);
  if (path === "restaurant/cart") return saveCartDetails(request);
  const enquiryMatch = path.match(/^jewellery\/enquiries\/([a-f\d]{24})$/i);
  if (enquiryMatch) {
    const input = await readJson(request, z.object({ status: z.enum(["CUSTOMER_MARKED_SENT", "BUSINESS_CONTACTED", "CLOSED"]) }).strict());
    const auth = await requireAuth(request, ["CUSTOMER"]);
    const business = await requireOwnedBusiness(auth);
    const enquiry = await JewelleryEnquiry.findOneAndUpdate(
      { _id: enquiryMatch[1], businessId: business._id },
      { $set: { status: input.status } },
      { new: true },
    );
    if (!enquiry) throw new HttpError(404, "ENQUIRY_NOT_FOUND", "Enquiry not found.");
    return ok({ enquiry });
  }
  return null;
}

export async function handleCommerceDelete(request: NextRequest, path: string): Promise<Response | null> {
  const tableMatch = path.match(/^restaurant\/tables\/([a-f\d]{24})$/i);
  if (!tableMatch) return null;
  const { business } = await ownedBusiness(request);
  const table = await RestaurantTable.findOne({ _id: tableMatch[1], businessId: business._id });
  if (!table) throw new HttpError(404, "TABLE_NOT_FOUND", "Restaurant table not found.");
  const used = table.scanCount > 0 || await DiningSession.exists({ tableId: table._id });
  if (used) throw new HttpError(409, "TABLE_HAS_HISTORY", "Deactivate this table instead. Tables with scan or session history cannot be deleted.");
  await RestaurantTable.deleteOne({ _id: table._id, businessId: business._id });
  return ok({ deleted: true });
}
