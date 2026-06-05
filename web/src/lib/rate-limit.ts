// In-memory fixed-window rate limiter.
//
// Serverless caveat (deliberate, documented): on Vercel each request may run on
// a different, short-lived instance, and this Map lives in ONE instance's
// memory. So this is a PER-INSTANCE ceiling, not a perfectly global one — it
// reliably throttles a single client hammering a warm instance (the realistic
// scraping case, since an MCP connection reuses a warm function), but the
// effective global limit can be higher when traffic spreads across instances,
// and counters reset on cold start. It needs zero infrastructure and no new
// tables, and is a real speed bump. If a hard global cap is ever required, swap
// the store here for Supabase/Redis without changing callers.

type Bucket = { count: number; resetAt: number };

// Module-level store. Keyed by caller (e.g. `mcp:<userId>`).
const buckets = new Map<string, Bucket>();

// Opportunistic pruning so the Map can't grow unbounded across many keys.
let lastPrune = 0;
function prune(now: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  /** Requests left in the current window (0 once over the limit). */
  remaining: number;
  /** When the current window resets, ms since epoch. */
  resetAt: number;
  /** Seconds until reset; 0 when allowed. Use for the Retry-After header. */
  retryAfterSec: number;
};

// Count one request against `key`. Returns whether it's allowed plus the
// figures needed for RateLimit-* / Retry-After headers. A request is counted
// even when it's rejected (so a hammering client keeps seeing 429 until the
// window rolls over) — that's the intended back-pressure.
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  prune(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: allowed
      ? 0
      : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
