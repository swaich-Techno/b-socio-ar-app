import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import {
  AnalyticsEvent,
  ArExperience,
  Business,
  CommerceProductProfile,
  Product,
  QrCode,
} from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ uniqueCode: string }> },
) {
  await dbConnect();
  const { uniqueCode } = await context.params;
  const qr = await QrCode.findOne({ uniqueCode, active: true });
  if (!qr) return NextResponse.redirect(new URL("/qr-unavailable?type=product&reason=not-found", request.url), 307);
  const ar = await ArExperience.findOne({ _id: qr.arExperienceId, status: "PUBLISHED" });
  const product = ar ? await Product.findOne({ _id: ar.productId, businessId: qr.businessId }) : null;
  const business = product ? await Business.findOne({ _id: product.businessId, status: "ACTIVE" }) : null;
  if (!ar || !product || !business) {
    return NextResponse.redirect(new URL("/qr-unavailable?type=product&reason=unavailable", request.url), 307);
  }
  const profile = await CommerceProductProfile.findOne({ productId: product._id }).select("kind");
  const category = `${business.category} ${product.category}`.toLowerCase();
  const restaurant = profile?.kind === "RESTAURANT" || /restaurant|cafe|café|food|bakery/.test(category);
  const jewellery = profile?.kind === "JEWELLERY" || /jewellery|jewelry|ring|bracelet|necklace/.test(category);
  const destination = restaurant
    ? `/ar-food/${business.slug}/${product.slug}`
    : jewellery
      ? `/try-on/${business.slug}/${product.slug}`
      : `/ar/${business.slug}/${product.slug}`;
  await Promise.all([
    QrCode.updateOne({ _id: qr._id, active: true }, { $inc: { scans: 1 } }),
    AnalyticsEvent.create({
      businessId: business._id,
      productId: product._id,
      arExperienceId: ar._id,
      qrCodeId: qr._id,
      eventType: "PRODUCT_QR_SCAN",
      deviceType: request.headers.get("user-agent")?.slice(0, 200),
      referrer: request.headers.get("referer")?.slice(0, 500),
    }),
  ]).catch((error) => console.error("Product QR analytics write failed", error));
  return NextResponse.redirect(new URL(destination, request.url), 307);
}
