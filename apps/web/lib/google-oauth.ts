import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { NextRequest } from "next/server";
import { ADMIN_ROLES, type UserRole } from "@bsocio/shared-types";
import { setSessionCookie, toSessionUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { dbConnect } from "@/lib/db";
import { getAuthSettings, getGoogleOAuthSettings } from "@/lib/env";
import { User } from "@/models";

export type GooglePortal = "customer" | "admin";

export const GOOGLE_OAUTH_COOKIE = "bsocio_google_oauth";
export const GOOGLE_OAUTH_COOKIE_PATH = "/api/auth/google";

const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const oauthIssuer = "b-socio-google-oauth";
const oauthAudience = "b-socio-google-callback";

type GoogleState = {
  portal: GooglePortal;
  nextPath: string;
  nonce: string;
  codeVerifier: string;
  oauthState: string;
};

export class GoogleOAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

function oauthKey() {
  return new TextEncoder().encode(getAuthSettings().secret);
}

export function safeGoogleNextPath(value: string | null, portal: GooglePortal): string {
  const fallback = portal === "admin" ? "/admin" : "/dashboard";
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (portal === "admin" && !value.startsWith("/admin")) return fallback;
  if (portal === "customer" && value.startsWith("/admin")) return fallback;
  return value;
}

export function googlePortalFromRequest(request: NextRequest): GooglePortal {
  return request.nextUrl.searchParams.get("portal") === "admin" ? "admin" : "customer";
}

export function googleLoginPath(portal: GooglePortal): string {
  return portal === "admin" ? "/admin/login" : "/login";
}

export function googleErrorUrl(request: NextRequest, portal: GooglePortal, code: string): URL {
  const url = new URL(googleLoginPath(portal), request.url);
  url.searchParams.set("google_error", code);
  return url;
}

export async function createGoogleAuthorization(request: NextRequest) {
  const portal = googlePortalFromRequest(request);
  const settings = getGoogleOAuthSettings();
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const oauthState = randomBytes(24).toString("base64url");
  const nextPath = safeGoogleNextPath(request.nextUrl.searchParams.get("next"), portal);

  const stateCookie = await new SignJWT({ portal, nextPath, nonce, codeVerifier, oauthState })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(oauthIssuer)
    .setAudience(oauthAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(oauthKey());

  const authorizationUrl = new URL(googleAuthorizationEndpoint);
  authorizationUrl.searchParams.set("client_id", settings.clientId);
  authorizationUrl.searchParams.set("redirect_uri", settings.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("prompt", "select_account");
  authorizationUrl.searchParams.set("state", oauthState);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return { authorizationUrl, stateCookie, portal, secure: settings.secure };
}

export async function readGoogleState(request: NextRequest): Promise<GoogleState> {
  const encoded = request.cookies.get(GOOGLE_OAUTH_COOKIE)?.value;
  if (!encoded) throw new GoogleOAuthError("session_expired", "The Google sign-in session has expired.");

  let payload;
  try {
    ({ payload } = await jwtVerify(encoded, oauthKey(), { issuer: oauthIssuer, audience: oauthAudience }));
  } catch {
    throw new GoogleOAuthError("session_expired", "The Google sign-in session is invalid or expired.");
  }

  const portal = payload.portal;
  const nextPath = payload.nextPath;
  const nonce = payload.nonce;
  const codeVerifier = payload.codeVerifier;
  const oauthState = payload.oauthState;
  if (
    (portal !== "customer" && portal !== "admin") ||
    typeof nextPath !== "string" ||
    typeof nonce !== "string" ||
    typeof codeVerifier !== "string" ||
    typeof oauthState !== "string"
  ) {
    throw new GoogleOAuthError("session_expired", "The Google sign-in session is invalid.");
  }
  if (request.nextUrl.searchParams.get("state") !== oauthState) {
    throw new GoogleOAuthError("state_mismatch", "The Google sign-in response could not be verified.");
  }
  return { portal, nextPath: safeGoogleNextPath(nextPath, portal), nonce, codeVerifier, oauthState };
}

export async function completeGoogleAuthorization(request: NextRequest, state: GoogleState) {
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    throw new GoogleOAuthError(providerError === "access_denied" ? "cancelled" : "provider_error", "Google sign-in was not completed.");
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) throw new GoogleOAuthError("missing_code", "Google did not return an authorization code.");

  const settings = getGoogleOAuthSettings();
  const tokenResponse = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: settings.redirectUri,
      grant_type: "authorization_code",
      code_verifier: state.codeVerifier,
    }),
    cache: "no-store",
  });
  const tokens = await tokenResponse.json() as { id_token?: string; error?: string };
  if (!tokenResponse.ok || !tokens.id_token) {
    throw new GoogleOAuthError("token_exchange_failed", "Google sign-in could not be completed.");
  }

  let identity;
  try {
    ({ payload: identity } = await jwtVerify(tokens.id_token, googleJwks, {
      audience: settings.clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    }));
  } catch {
    throw new GoogleOAuthError("identity_invalid", "Google returned an invalid identity.");
  }
  if (
    identity.nonce !== state.nonce ||
    typeof identity.sub !== "string" ||
    typeof identity.email !== "string" ||
    identity.email_verified !== true
  ) {
    throw new GoogleOAuthError("identity_invalid", "The Google identity could not be verified.");
  }

  const email = identity.email.trim().toLowerCase();
  await dbConnect();
  const user = await User.findOne({ email }).select("+googleSubject");
  if (!user) throw new GoogleOAuthError("account_not_found", "Create your B Socio account before using Google sign-in.");
  if (user.suspendedAt) throw new GoogleOAuthError("account_unavailable", "This account is unavailable.");

  const isAdmin = (ADMIN_ROLES as readonly UserRole[]).includes(user.role as UserRole);
  if ((state.portal === "admin") !== isAdmin) {
    throw new GoogleOAuthError("wrong_portal", state.portal === "admin" ? "Use the customer sign-in page." : "Use the administrator sign-in page.");
  }
  if (user.googleSubject && user.googleSubject !== identity.sub) {
    throw new GoogleOAuthError("account_mismatch", "This email is already linked to a different Google account.");
  }

  user.googleSubject = identity.sub;
  user.emailVerifiedAt ??= new Date();
  user.lastLoginAt = new Date();
  await user.save();
  await setSessionCookie(toSessionUser(user));
  await writeAudit({
    actorId: user._id.toString(),
    businessId: user.businessId?.toString(),
    action: isAdmin ? "GOOGLE_ADMIN_LOGIN" : "GOOGLE_CUSTOMER_LOGIN",
    entityType: "User",
    entityId: user._id.toString(),
    request,
  });

  return { redirectTo: state.nextPath };
}
