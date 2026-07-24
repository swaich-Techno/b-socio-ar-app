/* eslint-disable @typescript-eslint/no-explicit-any */
import { Schema, model, models, type Model } from "mongoose";

const objectId = Schema.Types.ObjectId;
const timestamps = { timestamps: true, versionKey: false } as const;

const restaurantSettingsSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, unique: true, index: true },
    whatsappCountryCode: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    defaultOrderLanguage: { type: String, default: "en" },
    branchNumbers: [{
      branchId: String,
      branchName: String,
      whatsappNumber: String,
    }],
    currency: { type: String, default: "INR" },
    taxPercentage: { type: Number, min: 0, max: 100, default: 0 },
    serviceChargePercentage: { type: Number, min: 0, max: 100, default: 0 },
    minimumOrderAmount: { type: Number, min: 0, default: 0 },
    orderAvailability: {
      type: String,
      enum: ["ACCEPTING", "TEMPORARILY_NOT_ACCEPTING", "CLOSED"],
      default: "TEMPORARILY_NOT_ACCEPTING",
      index: true,
    },
    defaultWhatsappMessage: { type: String, maxlength: 1000, default: "" },
    tableNumberingFormat: { type: String, maxlength: 120, default: "Table {number}" },
    menuLanguages: [{ type: String, maxlength: 12 }],
    orderInstructions: { type: String, maxlength: 2000, default: "" },
    openingHours: { type: String, maxlength: 2000, default: "" },
  },
  timestamps,
);

const jewellerySettingsSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, unique: true, index: true },
    whatsappCountryCode: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    branchNumbers: [{
      branchId: String,
      branchName: String,
      whatsappNumber: String,
    }],
    defaultEnquiryMessage: { type: String, maxlength: 1000, default: "" },
    appointmentContact: { type: String, maxlength: 100, default: "" },
    productWebsite: { type: String, maxlength: 500, default: "" },
    storeAddress: { type: String, maxlength: 1000, default: "" },
    businessHours: { type: String, maxlength: 2000, default: "" },
  },
  timestamps,
);

const commerceProductProfileSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    productId: { type: objectId, ref: "Product", required: true, unique: true, index: true },
    kind: { type: String, enum: ["RESTAURANT", "JEWELLERY"], required: true, index: true },
    imageUrl: { type: String, maxlength: 1000 },
    menuCategory: {
      type: String,
      enum: ["STARTERS", "MAIN_COURSE", "DESSERTS", "BEVERAGES", "BAKERY", "COMBOS", "SPECIALS"],
      default: "SPECIALS",
    },
    ingredients: [{ type: String, maxlength: 120 }],
    allergens: [{ type: String, maxlength: 120 }],
    vegetarian: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    spiceLevel: { type: Number, min: 0, max: 5, default: 0 },
    availability: { type: String, enum: ["AVAILABLE", "UNAVAILABLE", "HIDDEN"], default: "AVAILABLE", index: true },
    showWhenUnavailable: { type: Boolean, default: true },
    servingInformation: { type: String, maxlength: 500, default: "" },
    approximateServingSize: { type: String, maxlength: 200, default: "" },
    sku: { type: String, maxlength: 120 },
    jewelleryCategory: { type: String, maxlength: 120 },
    metalType: { type: String, maxlength: 120 },
    stoneType: { type: String, maxlength: 120 },
    productSize: { type: String, maxlength: 120 },
    variants: [{ type: String, maxlength: 120 }],
    tryOnEnabled: { type: Boolean, default: true },
  },
  timestamps,
);
commerceProductProfileSchema.index({ businessId: 1, kind: 1, availability: 1 });

const restaurantTableSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    branchId: { type: String, maxlength: 120, default: "main" },
    tableNumber: { type: String, required: true, trim: true, maxlength: 80 },
    tableName: { type: String, required: true, trim: true, maxlength: 120 },
    section: { type: String, trim: true, maxlength: 120, default: "" },
    capacity: { type: Number, required: true, min: 1, max: 100 },
    uniqueQrCode: { type: String, required: true, unique: true, index: true },
    qrCodeId: { type: objectId, required: true, unique: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    scanCount: { type: Number, min: 0, default: 0 },
    currentMenuDestination: { type: String, required: true, maxlength: 300 },
    qrCreatedAt: { type: Date, default: Date.now },
    internalNotes: { type: String, maxlength: 2000, default: "", select: false },
  },
  timestamps,
);
restaurantTableSchema.index({ businessId: 1, branchId: 1, tableNumber: 1 }, { unique: true });
restaurantTableSchema.index({ businessId: 1, status: 1, createdAt: -1 });

const diningSessionSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    branchId: { type: String, maxlength: 120, default: "main" },
    tableId: { type: objectId, ref: "RestaurantTable", required: true, index: true },
    sessionTokenHash: { type: String, required: true, unique: true, index: true, select: false },
    status: { type: String, enum: ["ACTIVE", "EXPIRED", "CLOSED"], default: "ACTIVE", index: true },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true },
  },
  timestamps,
);
diningSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
diningSessionSchema.index({ businessId: 1, tableId: 1, status: 1, startedAt: -1 });

const restaurantCartItemSchema = new Schema(
  {
    productId: { type: objectId, ref: "Product", required: true },
    productNameSnapshot: { type: String, required: true, maxlength: 160 },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    instructions: { type: String, maxlength: 500, default: "" },
  },
  timestamps,
);

const restaurantCartSchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    branchId: { type: String, maxlength: 120, default: "main" },
    tableId: { type: objectId, ref: "RestaurantTable", required: true, index: true },
    diningSessionId: { type: objectId, ref: "DiningSession", required: true, unique: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    items: { type: [restaurantCartItemSchema], default: [] },
    subtotal: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    serviceCharge: { type: Number, min: 0, default: 0 },
    estimatedTotal: { type: Number, min: 0, default: 0 },
    currency: { type: String, required: true, default: "INR" },
    orderNote: { type: String, maxlength: 1000, default: "" },
    customerName: { type: String, maxlength: 120, default: "" },
    status: {
      type: String,
      enum: ["DRAFT", "READY_FOR_WHATSAPP", "WHATSAPP_OPENED", "CUSTOMER_MARKED_SENT", "RECEIVED", "ACCEPTED", "PREPARING", "READY", "SERVED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },
    whatsappOpenedAt: Date,
  },
  timestamps,
);
restaurantCartSchema.index({ businessId: 1, createdAt: -1 });
restaurantCartSchema.index({ businessId: 1, status: 1, updatedAt: -1 });

const jewelleryEnquirySchema = new Schema(
  {
    businessId: { type: objectId, ref: "Business", required: true, index: true },
    branchId: { type: String, maxlength: 120, default: "main" },
    productId: { type: objectId, ref: "Product", required: true, index: true },
    tryOnProfileId: { type: String, maxlength: 160 },
    enquiryType: {
      type: String,
      enum: ["PRICE_ENQUIRY", "AVAILABILITY_ENQUIRY", "CUSTOM_SIZE_REQUEST", "STORE_VISIT", "VIDEO_CALL", "DELIVERY_ENQUIRY", "PRODUCT_RESERVATION", "GENERAL_ENQUIRY"],
      required: true,
      index: true,
    },
    customerName: { type: String, maxlength: 120, default: "" },
    customerMobile: { type: String, maxlength: 20, default: "" },
    customerCountryCode: { type: String, maxlength: 6, default: "" },
    customerCountry: { type: String, maxlength: 100, default: "" },
    customerTimezone: { type: String, maxlength: 100, default: "" },
    selectedHand: { type: String, enum: ["", "LEFT", "RIGHT"], default: "" },
    selectedFinger: { type: String, maxlength: 80, default: "" },
    selectedVariant: { type: String, maxlength: 120, default: "" },
    requestedSize: { type: String, maxlength: 120, default: "" },
    preferredDate: { type: String, maxlength: 20, default: "" },
    preferredTime: { type: String, maxlength: 20, default: "" },
    customerNote: { type: String, maxlength: 1000, default: "" },
    generatedMessage: { type: String, required: true, maxlength: 8000 },
    status: {
      type: String,
      enum: ["DRAFT", "READY_FOR_WHATSAPP", "WHATSAPP_OPENED", "CUSTOMER_MARKED_SENT", "BUSINESS_CONTACTED", "CLOSED"],
      default: "DRAFT",
      index: true,
    },
    whatsappOpenedAt: Date,
  },
  timestamps,
);
jewelleryEnquirySchema.index({ businessId: 1, createdAt: -1 });
jewelleryEnquirySchema.index({ businessId: 1, enquiryType: 1, createdAt: -1 });

type LooseModel = Model<any>;
const registered = (name: string, schema: Schema, collection: string): LooseModel =>
  (models[name] as LooseModel | undefined) ?? model<any>(name, schema, collection);

export const RestaurantSettings = registered("RestaurantSettings", restaurantSettingsSchema, "restaurantSettings");
export const JewellerySettings = registered("JewellerySettings", jewellerySettingsSchema, "jewellerySettings");
export const CommerceProductProfile = registered("CommerceProductProfile", commerceProductProfileSchema, "commerceProductProfiles");
export const RestaurantTable = registered("RestaurantTable", restaurantTableSchema, "restaurantTables");
export const DiningSession = registered("DiningSession", diningSessionSchema, "diningSessions");
export const RestaurantCart = registered("RestaurantCart", restaurantCartSchema, "restaurantCarts");
export const JewelleryEnquiry = registered("JewelleryEnquiry", jewelleryEnquirySchema, "jewelleryEnquiries");
