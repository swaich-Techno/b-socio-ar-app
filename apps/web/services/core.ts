import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { ArExperience, Business, Model3D, Product, QrCode } from "@/models";

export function makeSlug(value: string): string {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return base || `business-${randomBytes(4).toString("hex")}`;
}

export function ownerFilter(auth: AuthContext, businessId?: string) {
  if (auth.isAdmin) return businessId ? { businessId } : {};
  return { ownerId: auth.id, ...(auth.businessId ? { businessId: auth.businessId } : {}) };
}

export async function requireOwnedProduct(productId: string, auth: AuthContext) {
  const product = await Product.findOne({ _id: productId, ...ownerFilter(auth) });
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  return product;
}

export async function requireOwnedBusiness(auth: AuthContext) {
  const business = await Business.findOne(auth.isAdmin && auth.businessId ? { _id: auth.businessId } : { ownerId: auth.id });
  if (!business) throw new HttpError(409, "ONBOARDING_REQUIRED", "Complete business onboarding first.");
  if (business.status !== "ACTIVE") throw new HttpError(403, "BUSINESS_SUSPENDED", "This business is suspended.");
  return business;
}

export async function ensureDraftExperience(productId: string) {
  const product = await Product.findById(productId);
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const model = await Model3D.findOne({ productId }).sort({ version: -1 });
  if (!model) throw new HttpError(409, "MODEL_NOT_READY", "A valid model is required before creating AR.");

  let ar = await ArExperience.findOne({ productId });
  if (!ar) {
    const business = await Business.findById(product.businessId);
    if (!business) throw new HttpError(404, "BUSINESS_NOT_FOUND", "Business not found.");
    const draftSlug = `${business.slug}/${product.slug}-${randomBytes(4).toString("hex")}`;
    ar = await ArExperience.create({
      ownerId: product.ownerId,
      businessId: product.businessId,
      productId: product._id,
      modelId: model._id,
      draftSlug,
      status: "READY_FOR_REVIEW",
      title: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      whatsappUrl: business.whatsapp,
      websiteUrl: business.website,
      instagramUrl: business.instagram,
    });
    await Business.updateOne({ _id: product.businessId }, { $inc: { demoArCount: 1 } });
  }

  let qr = await QrCode.findOne({ productId });
  if (!qr) {
    const uniqueCode = randomBytes(7).toString("base64url");
    qr = await QrCode.create({
      ownerId: product.ownerId,
      businessId: product.businessId,
      productId: product._id,
      arExperienceId: ar._id,
      uniqueCode,
      destinationPath: `/ar/${ar.draftSlug}`,
      active: false,
    });
    await Business.updateOne({ _id: product.businessId }, { $inc: { demoQrCount: 1 } });
  }
  return { ar, qr, model };
}
