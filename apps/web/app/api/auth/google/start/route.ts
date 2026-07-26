import { NextResponse, type NextRequest } from "next/server";
import {
  createGoogleAuthorization,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_COOKIE_PATH,
  googleErrorUrl,
  googlePortalFromRequest,
} from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const portal = googlePortalFromRequest(request);
  try {
    const authorization = await createGoogleAuthorization(request);
    const response = NextResponse.redirect(authorization.authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_COOKIE, authorization.stateCookie, {
      httpOnly: true,
      secure: authorization.secure,
      sameSite: "lax",
      path: GOOGLE_OAUTH_COOKIE_PATH,
      maxAge: 10 * 60,
      priority: "high",
    });
    return response;
  } catch (error) {
    console.error("Google authorization could not start", error);
    return NextResponse.redirect(googleErrorUrl(request, portal, "not_configured"));
  }
}
