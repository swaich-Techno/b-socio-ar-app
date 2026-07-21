import { HttpError } from "@/lib/http";
import { RateLimitBucket } from "@/models";

interface Bucket { count: number; resetAt: number }
const globalStore = globalThis as typeof globalThis & { __bsocioRateLimits?: Map<string, Bucket> };
const buckets = globalStore.__bsocioRateLimits ?? new Map<string, Bucket>();
globalStore.__bsocioRateLimits = buckets;

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    const retrySeconds = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
    throw new HttpError(429, "RATE_LIMITED", `Too many attempts. Try again in ${retrySeconds} seconds.`);
  }
}

export async function enforceDatabaseRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const bucket = await RateLimitBucket.findOneAndUpdate(
    { key },
    [
      {
        $set: {
          count: { $cond: [{ $gt: ["$resetAt", now] }, { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
          resetAt: { $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", resetAt] },
        },
      },
    ],
    { new: true, upsert: true },
  ).lean() as unknown as { count: number; resetAt: Date } | null;
  if (bucket && bucket.count > limit) {
    const retrySeconds = Math.max(Math.ceil((new Date(bucket.resetAt).getTime() - now.getTime()) / 1000), 1);
    throw new HttpError(429, "RATE_LIMITED", `Too many attempts. Try again in ${retrySeconds} seconds.`);
  }
}

export function resetRateLimitForTests(): void {
  buckets.clear();
}
