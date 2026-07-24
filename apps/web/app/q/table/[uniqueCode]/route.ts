import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AnalyticsEvent } from "@/models";
import {
  DINING_SESSION_COOKIE,
  DINING_SESSION_TTL_SECONDS,
  createDiningSessionForTableCode,
} from "@/services/commerce/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ uniqueCode: string }> },
) {
  try {
    const { uniqueCode } = await context.params;
    const { token, session, table, business } = await createDiningSessionForTableCode(uniqueCode);
    const destination = typeof table.currentMenuDestination === "string" &&
      table.currentMenuDestination.startsWith(`/menu/${business.slug}`)
      ? table.currentMenuDestination
      : `/menu/${business.slug}`;
    const redirectUrl = new URL(destination, request.url);
    redirectUrl.searchParams.set("table", String(table._id));
    redirectUrl.searchParams.set("session", token);
    const response = NextResponse.redirect(redirectUrl, 307);
    response.cookies.set(DINING_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DINING_SESSION_TTL_SECONDS,
      priority: "high",
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    await AnalyticsEvent.create({
      businessId: business._id,
      eventType: "TABLE_QR_SCAN",
      metadata: { tableId: String(table._id), diningSessionId: String(session._id) },
      deviceType: request.headers.get("user-agent")?.slice(0, 200),
      referrer: request.headers.get("referer")?.slice(0, 500),
    }).catch((error) => console.error("Table QR analytics write failed", error));
    return response;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as { code?: string }).code) : "";
    const inactive = code === "TABLE_INACTIVE";
    const url = new URL("/qr-unavailable", request.url);
    url.searchParams.set("type", "table");
    url.searchParams.set("reason", inactive ? "inactive" : "not-found");
    return NextResponse.redirect(url, 307);
  }
}
