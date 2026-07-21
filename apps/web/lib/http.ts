import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiFailure, ApiSuccess } from "@bsocio/shared-types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, fieldErrors: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted fields.",
          fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
        },
      },
      { status: 422 },
    );
  }
  const message = error instanceof Error && /not configured|must contain/.test(error.message)
    ? error.message
    : "The request could not be completed. Please try again.";
  console.error("Unhandled API error", error);
  return NextResponse.json({ ok: false, error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function getClientIp(request: Request): string {
  // The production origin is expected to accept traffic only through Cloudflare;
  // unlike X-Forwarded-For, this header is overwritten at that trusted edge.
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

export function pagination(request: Request, maxPageSize = 50) {
  const url = new URL(request.url);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20, 1), maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
