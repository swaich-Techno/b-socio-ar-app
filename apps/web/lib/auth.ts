import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionUser, UserRole } from "@bsocio/shared-types";
import { ADMIN_ROLES } from "@bsocio/shared-types";
import { dbConnect } from "@/lib/db";
import { getAuthSettings } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { User } from "@/models";

const issuer = "b-socio-ar";
const audience = "b-socio-web";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export type LoginCredentialSource = "bootstrap" | "stored";

/**
 * The configured bootstrap credential is authoritative when it is present.
 * This lets an administrator rotate the Vercel secret even when the account
 * already exists in MongoDB, without leaving the previous database password
 * valid as a fallback.
 */
export async function verifyLoginPassword(
  password: string,
  storedHash?: string | null,
  bootstrapHash?: string,
): Promise<LoginCredentialSource | null> {
  if (bootstrapHash) {
    return (await verifyPassword(password, bootstrapHash)) ? "bootstrap" : null;
  }
  if (storedHash) {
    return (await verifyPassword(password, storedHash)) ? "stored" : null;
  }
  return null;
}

export function createOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOpaqueToken(raw) };
}

export function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function signSession(user: SessionUser): Promise<string> {
  const settings = getAuthSettings();
  return new SignJWT({
    email: user.email,
    name: user.fullName,
    role: user.role,
    businessId: user.businessId,
    sessionVersion: user.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${settings.ttlSeconds}s`)
    .sign(new TextEncoder().encode(settings.secret));
}

export async function verifySessionToken(token: string): Promise<SessionUser> {
  const settings = getAuthSettings();
  const { payload } = await jwtVerify(token, new TextEncoder().encode(settings.secret), { issuer, audience });
  if (
    !payload.sub ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.sessionVersion !== "number"
  ) {
    throw new Error("Invalid session claims");
  }
  return {
    id: payload.sub,
    email: payload.email,
    fullName: payload.name,
    role: payload.role as UserRole,
    businessId: typeof payload.businessId === "string" ? payload.businessId : undefined,
    sessionVersion: payload.sessionVersion,
  };
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const settings = getAuthSettings();
  const cookieStore = await cookies();
  cookieStore.set(settings.cookieName, await signSession(user), {
    httpOnly: true,
    secure: settings.secure,
    sameSite: "lax",
    path: "/",
    maxAge: settings.ttlSeconds,
    priority: "high",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const settings = getAuthSettings();
  const cookieStore = await cookies();
  cookieStore.set(settings.cookieName, "", {
    httpOnly: true,
    secure: settings.secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function sessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const { cookieName } = getAuthSettings();
  const token = request.cookies.get(cookieName)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export interface AuthContext extends SessionUser {
  isAdmin: boolean;
}

export async function requireAuth(request: NextRequest, allowedRoles?: readonly UserRole[]): Promise<AuthContext> {
  const session = await sessionFromRequest(request);
  if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  await dbConnect();
  const user = await User.findById(session.id);
  if (!user || user.suspendedAt) throw new HttpError(403, "ACCOUNT_UNAVAILABLE", "This account is unavailable. Contact support.");
  if (user.sessionVersion !== session.sessionVersion || user.role !== session.role) {
    throw new HttpError(401, "SESSION_EXPIRED", "Your session has changed. Sign in again.");
  }
  if (allowedRoles && !allowedRoles.includes(user.role as UserRole)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return {
    id: user._id.toString(),
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    businessId: user.businessId?.toString(),
    sessionVersion: user.sessionVersion,
    isAdmin: ADMIN_ROLES.includes(user.role),
  };
}

export function toSessionUser(user: {
  _id: { toString(): string };
  email: string;
  fullName: string;
  role: UserRole;
  businessId?: { toString(): string } | null;
  sessionVersion: number;
}): SessionUser {
  return {
    id: user._id.toString(),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    businessId: user.businessId?.toString(),
    sessionVersion: user.sessionVersion,
  };
}
