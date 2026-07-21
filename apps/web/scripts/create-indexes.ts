import { disconnectDatabase } from "@bsocio/database";
import { dbConnect } from "../lib/db";
import {
  AnalyticsEvent, Approval, ArExperience, Asset, AuditLog, Business, CustomPackage, DemoProject,
  Model3D, Notification, Payment, Product, QrCode, RateLimitBucket, SupportTicket, ThreeDJob, User, WorkerHeartbeat,
} from "../models";

const managedModels = [
  User, Business, DemoProject, Product, Asset, ThreeDJob, Model3D, ArExperience, QrCode,
  Approval, CustomPackage, Payment, Notification, AnalyticsEvent, AuditLog, WorkerHeartbeat, RateLimitBucket, SupportTicket,
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
