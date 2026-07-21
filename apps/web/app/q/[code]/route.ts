import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { AnalyticsEvent, ArExperience, Business, Product, QrCode } from "@/models";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await dbConnect();
  const { code } = await params;
  const qr = await QrCode.findOne({ uniqueCode: code, active: true });
  if (!qr) return NextResponse.redirect(new URL("/?qr=inactive", request.url), 307);
  const ar = await ArExperience.findOne({ _id: qr.arExperienceId, status: "PUBLISHED" });
  const [product, business] = ar ? await Promise.all([Product.findById(ar.productId), Business.findById(ar.businessId)]) : [null, null];
  if (!ar || !product || !business || ar.publicSlug !== `${business.slug}/${product.slug}`) return NextResponse.redirect(new URL("/?qr=unavailable", request.url), 307);
  const destinationPath = `/ar/${business.slug}/${product.slug}`;
  const sessionSource = `${request.headers.get("user-agent") ?? ""}:${request.headers.get("accept-language") ?? ""}`;
  try {
    await Promise.all([
      QrCode.updateOne({ _id: qr._id, active: true }, { $inc: { scans: 1 } }),
      AnalyticsEvent.create({ businessId: qr.businessId, productId: product._id, arExperienceId: ar._id, qrCodeId: qr._id, eventType: "QR_SCAN", sessionHash: createHash("sha256").update(sessionSource).digest("hex"), deviceType: request.headers.get("user-agent")?.slice(0, 200), referrer: request.headers.get("referer")?.slice(0, 500) }),
    ]);
  } catch (error) { console.error("QR analytics write failed", error); }
  return NextResponse.redirect(new URL(destinationPath, request.url), 307);
}
