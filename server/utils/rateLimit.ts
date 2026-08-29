import type { H3Event } from 'h3'
import { createError, getRequestIP } from 'h3'

// Simple in-memory sliding-window rate limiter.
// Single-node only; swap with Redis for multi-node deployments.

interface RateBucket {
  timestamps: number[]
  lastTouched: number
}

const buckets = new Map<string, RateBucket>()
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()
// A bucket that hasn't been touched for this long will be reaped even if not empty.
// (Windows max out at 1 hour anyway — this is safe.)
const BUCKET_MAX_IDLE_MS = 2 * 60 * 60 * 1000

function cleanupStaleBuckets(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [k, b] of buckets) {
    if (b.timestamps.length === 0 || now - b.lastTouched > BUCKET_MAX_IDLE_MS) {
      buckets.delete(k)
    }
  }
}

function checkLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean, retryAfter: number } {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { timestamps: [], lastTouched: now }
    buckets.set(key, bucket)
  }
  bucket.lastTouched = now

  // Filter to entries within the window
  const cutoff = now - windowMs
  const valid = bucket.timestamps.filter((t) => t > cutoff)
  bucket.timestamps = valid

  if (valid.length >= max) {
    const oldest = valid[0] ?? now
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    }
  }
  valid.push(now)
  return { allowed: true, retryAfter: 0 }
}

export interface RateLimitOptions {
  /** Bucket key prefix, e.g. 'login', 'register'. */
  keyPrefix: string
  /** Max requests allowed within the window. */
  max: number
  /** Time window in milliseconds. */
  windowMs: number
  /** Optional identifier (email/username) to scope the limit beyond the IP. */
  identifier?: string
}

/**
 * Enforce a sliding-window rate limit keyed by IP (+ optional identifier).
 * Throws a 429 error (with Retry-After header) when the limit is exceeded.
 *
 * Only trusts `X-Forwarded-For` when `TRUST_PROXY` env is explicitly enabled,
 * to prevent IP forgery when the app is exposed directly without a trusted proxy.
 */
export async function enforceRateLimit(
  event: H3Event,
  opts: RateLimitOptions
): Promise<void> {
  const trustProxy = process.env.TRUST_PROXY === 'true'
  const ip = getRequestIP(event, { xForwardedFor: trustProxy }) ?? 'unknown'
  const key = `${opts.keyPrefix}:${ip}:${opts.identifier ?? ''}`
  cleanupStaleBuckets(Date.now())
  const { allowed, retryAfter } = checkLimit(key, opts.max, opts.windowMs)
  if (!allowed) {
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Too many requests. Try again in ${retryAfter} seconds.`
    })
  }
}
