/**
 * Rate limiting with pluggable storage.
 *
 * - `memory` (default): in-process sliding window, fine for single-node dev.
 * - `postgres`: shared fixed-window counters so multiple app instances share
 *   one budget (`RATE_LIMIT_DRIVER=postgres`).
 *
 * Both stores expose the same `hit()` contract; callers never care which one
 * is active.
 */

import type { H3Event } from 'h3'
import { createError, getRequestIP, setResponseHeader } from 'h3'

export interface RateLimitDecision {
  allowed: boolean
  /** Seconds until the caller may retry. */
  retryAfter: number
}

export interface RateLimitStore {
  hit: (key: string, max: number, windowMs: number) => Promise<RateLimitDecision>
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000
const BUCKET_MAX_IDLE_MS = 2 * 60 * 60 * 1000

export function createMemoryRateLimitStore(): RateLimitStore {
  interface Bucket {
    timestamps: number[]
    lastTouched: number
  }

  const buckets = new Map<string, Bucket>()
  let lastCleanup = Date.now()

  function cleanup(now: number): void {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
    lastCleanup = now
    for (const [key, bucket] of buckets) {
      if (bucket.timestamps.length === 0 || now - bucket.lastTouched > BUCKET_MAX_IDLE_MS) {
        buckets.delete(key)
      }
    }
  }

  return {
    async hit(key, max, windowMs) {
      const now = Date.now()
      cleanup(now)
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { timestamps: [], lastTouched: now }
        buckets.set(key, bucket)
      }
      bucket.lastTouched = now

      const cutoff = now - windowMs
      const valid = bucket.timestamps.filter(timestamp => timestamp > cutoff)
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
  }
}

// ---------------------------------------------------------------------------
// Postgres store
// ---------------------------------------------------------------------------

/** Minimal pool contract so the store is testable without a real database. */
export interface RateLimitPool {
  query: (text: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}

const COUNTERS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "bucket_key" varchar(255) PRIMARY KEY,
  "window_started_at" timestamptz NOT NULL,
  "hits" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
)`

const HIT_SQL = `INSERT INTO "rate_limit_counters" ("bucket_key", "window_started_at", "hits", "updated_at")
VALUES ($1, now(), 1, now())
ON CONFLICT ("bucket_key") DO UPDATE SET
  "hits" = CASE
    WHEN "rate_limit_counters"."window_started_at" <= $2::timestamptz THEN 1
    ELSE "rate_limit_counters"."hits" + 1
  END,
  "window_started_at" = CASE
    WHEN "rate_limit_counters"."window_started_at" <= $2::timestamptz THEN now()
    ELSE "rate_limit_counters"."window_started_at"
  END,
  "updated_at" = now()
RETURNING "hits", "window_started_at"`

export function createPostgresRateLimitStore(
  resolvePool: () => Promise<RateLimitPool> = async () => (await import('../database')).pool as unknown as RateLimitPool
): RateLimitStore {
  let tableReady: Promise<void> | null = null
  let lastCleanup = 0

  function ensureTable(pool: RateLimitPool): Promise<void> {
    if (!tableReady) {
      tableReady = pool.query(COUNTERS_TABLE_DDL)
        .then(() => undefined)
        .catch((error) => {
          tableReady = null
          throw error
        })
    }
    return tableReady
  }

  return {
    async hit(key, max, windowMs) {
      const pool = await resolvePool()
      await ensureTable(pool)

      const now = Date.now()
      const { rows } = await pool.query(HIT_SQL, [key, new Date(now - windowMs)])
      const row = rows[0] ?? {}
      const hits = Number(row.hits ?? 1)
      const startedAtRaw = row.window_started_at
      const startedAt = startedAtRaw instanceof Date
        ? startedAtRaw.getTime()
        : new Date(String(startedAtRaw ?? now)).getTime()
      const elapsed = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0

      if (now - lastCleanup > 10 * 60_000) {
        lastCleanup = now
        pool.query(
          'DELETE FROM "rate_limit_counters" WHERE "updated_at" < $1',
          [new Date(now - BUCKET_MAX_IDLE_MS)]
        ).catch(() => {})
      }

      if (hits > max) {
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)) }
      }
      return { allowed: true, retryAfter: 0 }
    }
  }
}

// ---------------------------------------------------------------------------
// Active store + enforcement
// ---------------------------------------------------------------------------

let activeStore: RateLimitStore | null = null

export function getRateLimitStore(): RateLimitStore {
  if (!activeStore) {
    activeStore = process.env.RATE_LIMIT_DRIVER === 'postgres'
      ? createPostgresRateLimitStore()
      : createMemoryRateLimitStore()
  }
  return activeStore
}

/** Test helper: drop the resolved store so the driver/env is re-evaluated. */
export function resetRateLimitStore(store?: RateLimitStore): void {
  activeStore = store ?? null
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
 * Enforce a rate limit keyed by IP (+ optional identifier).
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
  const { allowed, retryAfter } = await getRateLimitStore().hit(key, opts.max, opts.windowMs)
  if (!allowed) {
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Too many requests. Try again in ${retryAfter} seconds.`
    })
  }
}
