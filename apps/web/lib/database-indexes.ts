import {
  AddOnPack,
  AnalyticsEvent,
  Approval,
  ArExperience,
  Asset,
  AuditLog,
  BillingEvent,
  Branch,
  Business,
  CommerceProductProfile,
  Coupon,
  CouponRedemption,
  CustomPackage,
  DemoProject,
  DiningSession,
  Invoice,
  InvoiceItem,
  JewelleryEnquiry,
  JewellerySettings,
  ManualPayment,
  Model3D,
  Notification,
  Payment,
  PaymentWebhookEvent,
  Plan,
  PlanPrice,
  Product,
  PurchasedAddOn,
  QrCode,
  RateLimitBucket,
  Refund,
  RestaurantCart,
  RestaurantSettings,
  RestaurantTable,
  Subscription,
  SubscriptionChange,
  SubscriptionUsage,
  SupportTicket,
  ThreeDJob,
  User,
  WorkerHeartbeat,
} from "../models";
import { dbConnect } from "./db";

const managedModels = [
  User, Business, DemoProject, Product, Asset, ThreeDJob, Model3D, ArExperience, QrCode,
  Approval, CustomPackage, Payment, Notification, AnalyticsEvent, AuditLog, WorkerHeartbeat,
  RateLimitBucket, SupportTicket, RestaurantSettings, JewellerySettings, CommerceProductProfile,
  RestaurantTable, DiningSession, RestaurantCart, JewelleryEnquiry, Plan, PlanPrice, Subscription,
  SubscriptionUsage, Invoice, InvoiceItem, Coupon, CouponRedemption, AddOnPack, PurchasedAddOn,
  BillingEvent, PaymentWebhookEvent, ManualPayment, SubscriptionChange, Refund, Branch,
];

export async function ensureDatabaseIndexes(log: (message: string) => void = console.log) {
  await dbConnect();
  for (const model of managedModels) {
    await model.createIndexes();
    log(`Indexes ensured: ${model.collection.name}`);
  }
}
