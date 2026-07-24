import { disconnectDatabase } from "@bsocio/database";
import { dbConnect } from "../lib/db";
import {
  AnalyticsEvent, Approval, ArExperience, Asset, AuditLog, Business, CustomPackage, DemoProject,
  CommerceProductProfile, DiningSession, JewelleryEnquiry, JewellerySettings, Model3D, Notification,
  Payment, Product, QrCode, RateLimitBucket, RestaurantCart, RestaurantSettings, RestaurantTable,
  SupportTicket, ThreeDJob, User, WorkerHeartbeat, AddOnPack, BillingEvent, Branch, Coupon,
  CouponRedemption, Invoice, InvoiceItem, ManualPayment, PaymentWebhookEvent, Plan, PlanPrice,
  PurchasedAddOn, Refund, Subscription, SubscriptionChange, SubscriptionUsage,
} from "../models";

const managedModels = [
  User, Business, DemoProject, Product, Asset, ThreeDJob, Model3D, ArExperience, QrCode,
  Approval, CustomPackage, Payment, Notification, AnalyticsEvent, AuditLog, WorkerHeartbeat, RateLimitBucket, SupportTicket,
  RestaurantSettings, JewellerySettings, CommerceProductProfile, RestaurantTable, DiningSession, RestaurantCart, JewelleryEnquiry,
  Plan, PlanPrice, Subscription, SubscriptionUsage, Invoice, InvoiceItem, Coupon, CouponRedemption,
  AddOnPack, PurchasedAddOn, BillingEvent, PaymentWebhookEvent, ManualPayment, SubscriptionChange, Refund, Branch,
];

async function main() {
  await dbConnect();
  for (const model of managedModels) {
    await model.createIndexes();
    console.log(`Indexes ensured: ${model.collection.name}`);
  }
}

main()
  .catch((error) => { console.error("Index migration failed", error); process.exitCode = 1; })
  .finally(async () => { await disconnectDatabase(); });
