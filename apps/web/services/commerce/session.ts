import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { Business, DiningSession, RestaurantTable } from "@/models";

export const DINING_SESSION_COOKIE = "bsocio_dining_session";
export const DINING_SESSION_TTL_SECONDS = 4 * 60 * 60;

function sessionTokenFromRequest(request: NextRequest): string {
  const url = new URL(request.url);
  return (
    request.headers.get("x-dining-session")?.trim() ||
    url.searchParams.get("session")?.trim() ||
    request.cookies.get(DINING_SESSION_COOKIE)?.value ||
    ""
  );
}

export async function createDiningSessionForTableCode(uniqueCode: string) {
  await dbConnect();
  const table = await RestaurantTable.findOne({ uniqueQrCode: uniqueCode });
  if (!table) throw new HttpError(404, "TABLE_QR_NOT_FOUND", "This table QR code is not recognised.");
  if (table.status !== "ACTIVE") {
    throw new HttpError(410, "TABLE_INACTIVE", "This table is not accepting orders. Please ask restaurant staff for help.");
  }
  const business = await Business.findOne({ _id: table.businessId, status: "ACTIVE" });
  if (!business) throw new HttpError(404, "RESTAURANT_NOT_AVAILABLE", "This restaurant menu is not available.");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DINING_SESSION_TTL_SECONDS * 1000);
  const session = await DiningSession.create({
    businessId: table.businessId,
    branchId: table.branchId,
    tableId: table._id,
    sessionTokenHash: hashOpaqueToken(token),
    status: "ACTIVE",
    startedAt: now,
    lastActivityAt: now,
    expiresAt,
  });
  await RestaurantTable.updateOne({ _id: table._id, status: "ACTIVE" }, { $inc: { scanCount: 1 } });
  return { token, expiresAt, session, table, business };
}

export async function requireDiningSession(request: NextRequest, businessId?: string) {
  const token = sessionTokenFromRequest(request);
  if (!token || token.length < 32 || token.length > 512) {
    throw new HttpError(401, "TABLE_SESSION_REQUIRED", "Scan your table QR code before placing an order.");
  }
  await dbConnect();
  const session = await DiningSession.findOne({
    sessionTokenHash: hashOpaqueToken(token),
    status: "ACTIVE",
    expiresAt: { $gt: new Date() },
    ...(businessId ? { businessId } : {}),
  });
  if (!session) {
    throw new HttpError(401, "TABLE_SESSION_EXPIRED", "Your table session has expired. Scan the table QR code again.");
  }
  const [table, business] = await Promise.all([
    RestaurantTable.findOne({ _id: session.tableId, businessId: session.businessId }),
    Business.findOne({ _id: session.businessId, status: "ACTIVE" }),
  ]);
  if (!table || table.status !== "ACTIVE" || !business) {
    throw new HttpError(410, "TABLE_INACTIVE", "This table is not accepting orders. Please ask restaurant staff for help.");
  }
  session.lastActivityAt = new Date();
  await session.save();
  return { token, session, table, business };
}

export async function optionalDiningSession(request: NextRequest, businessId?: string) {
  try {
    return await requireDiningSession(request, businessId);
  } catch (error) {
    if (error instanceof HttpError && ["TABLE_SESSION_REQUIRED", "TABLE_SESSION_EXPIRED"].includes(error.code)) return null;
    throw error;
  }
}
