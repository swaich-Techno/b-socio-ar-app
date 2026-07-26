import { jwtVerify } from "jose/jwt/verify";
import { NextResponse, type NextRequest } from "next/server";

const customerPrefixes = ["/dashboard", "/onboarding"];
const adminPrefixes = ["/admin"];

function loginUrl(request: NextRequest, admin: boolean) {
  const url = new URL(admin ? "/admin/login" : "/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return url;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin/login" || pathname === "/admin/register" || pathname === "/admin/forgot-password") return NextResponse.next();
  const isCustomerPath = customerPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAdminPath = adminPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (!isCustomerPath && !isAdminPath) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const cookieName = process.env.AUTH_COOKIE_NAME || "bsocio_session";
  const token = request.cookies.get(cookieName)?.value;
  if (!secret || secret.length < 32 || !token) return NextResponse.redirect(loginUrl(request, isAdminPath));

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "b-socio-ar",
      audience: "b-socio-web",
    });
    const role = typeof payload.role === "string" ? payload.role : "";
    if (isAdminPath && role === "CUSTOMER") return NextResponse.redirect(loginUrl(request, true));
    if (isCustomerPath && role !== "CUSTOMER") return NextResponse.redirect(new URL("/admin", request.url));
    const headers = new Headers(request.headers);
    headers.set("x-bsocio-user", payload.sub ?? "");
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.redirect(loginUrl(request, isAdminPath));
  }
}

export const config = { matcher: ["/dashboard/:path*", "/onboarding/:path*", "/admin/:path*"] };
