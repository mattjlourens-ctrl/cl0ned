// Per-IP limit on searches, stored in Upstash Redis. It has to live outside the server's memory
// because Vercel runs many separate instances that don't share memory.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const SEARCHES_PER_MINUTE = 10;

// Returns whether this visitor may search now, and when their window resets (ms since 1970).
export type Limiter = (visitorId: string) => Promise<{ success: boolean; reset: number }>;

// null when Upstash isn't configured. Accepts Upstash's own variable names and the KV_* names
// the Vercel integration sets.
export function upstashLimiter(): Limiter | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(SEARCHES_PER_MINUTE, "1 m"),
    prefix: "cl0ned:search",
    // If Redis doesn't answer within 5s the search is let through (library default), so a slow
    // Redis doesn't take the whole app down. Errors (e.g. a wrong token) are handled by the caller.
  });
  return (visitorId) => ratelimit.limit(visitorId);
}

// The visitor's IP. On Vercel, x-forwarded-for is set by Vercel itself (a value sent by the
// visitor is overwritten), so the first entry can be trusted there.
export function visitorIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
