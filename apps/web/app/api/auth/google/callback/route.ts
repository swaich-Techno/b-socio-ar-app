import { NextResponse, type NextRequest } from "next/server";
import {
  completeGoogleAuthorization,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_COOKIE_PATH,
  googleErrorUrl,
  GoogleOAuthError,
  type GooglePortal,
  readGoogleState,
} from "@/lib/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearState(response: NextResponse) {
  response.cookies.set(GOOGLE_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GOOGLE_OAUTH_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  let portal: GooglePortal = "customer";
  try {
    const state = await readGoogleState(request);
    portal = state.portal;
    const result = await completeGoogleAuthorization(request, state);
    return clearState(NextResponse.redirect(new URL(result.redirectTo, request.url), 303));
  } catch (error) {
    console.error("Google authorization callback failed", error);
    const code = error instanceof GoogleOAuthError ? error.code : "failed";
    return clearState(NextResponse.redirect(googleErrorUrl(request, portal, code), 303));
  }
}
