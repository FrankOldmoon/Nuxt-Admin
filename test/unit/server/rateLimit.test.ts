import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMemoryRateLimitStore,
  createPostgresRateLimitStore,
  enforceRateLimit,
  resetRateLimitStore,
  type RateLimitPool
} from '../../../server/utils/rateLimit'

const { getRequestIP, createError, setResponseHeader } = vi.hoisted(() => ({
  getRequestIP: vi.fn(() => '1.2.3.4'),
  createError: vi.fn((opts?: { message?: string, statusCode?: number, statusMessage?: string }) => {
    const error = new Error(opts?.message || opts?.statusMessage || 'error') as Error & {
      statusCode?: number
      statusMessage?: string
    }
    error.statusCode = opts?.statusCode
    error.statusMessage = opts?.statusMessage
    return error
  }),
  setResponseHeader: vi.fn()
}))
vi.mock('h3', () => ({ getRequestIP, createError, setResponseHeader }))
vi.stubGlobal('setResponseHeader', setResponseHeader)

afterEach(() => resetRateLimitStore())

describe('memory rate limit store', () => {
  it('allows calls up to the limit and rejects the next one', async () => {
    const store = createMemoryRateLimitStore()
    for (let i = 0; i < 3; i++) {
      await expect(store.hit('k', 3, 60_000)).resolves.toEqual({ allowed: true, retryAfter: 0 })
    }
    const blocked = await store.hit('k', 3, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('keeps keys independent', async () => {
    const store = createMemoryRateLimitStore()
    await store.hit('a', 1, 60_000)
    expect((await store.hit('a', 1, 60_000)).allowed).toBe(false)
    expect((await store.hit('b', 1, 60_000)).allowed).toBe(true)
  })
})

describe('postgres rate limit store', () => {
  function fakePool() {
    const rows: Array<{ hits: number, window_started_at: Date }> = []
    const state = { hits: 0, windowStart: new Date() }
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql.startsWith('CREATE TABLE')) {
        rows.push({ hits: 0, window_started_at: new Date() })
        return { rows: [] }
      }
      if (sql.startsWith('DELETE FROM')) return { rows: [] }
      // HIT_SQL: reset the window when it is older than the cutoff.
      const cutoff = values?.[1] as Date
      if (state.windowStart <= cutoff) {
        state.hits = 1
        state.windowStart = new Date()
      } else {
        state.hits += 1
      }
      return { rows: [{ hits: state.hits, window_started_at: state.windowStart }] }
    })
    return { pool: { query } as RateLimitPool, query, state }
  }

  it('creates the counter table lazily and blocks over the limit', async () => {
    const { pool, query } = fakePool()
    const store = createPostgresRateLimitStore(async () => pool)

    expect((await store.hit('shared:key', 2, 60_000)).allowed).toBe(true)
    expect((await store.hit('shared:key', 2, 60_000)).allowed).toBe(true)
    const blocked = await store.hit('shared:key', 2, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)

    expect(query.mock.calls[0]?.[0]).toContain('CREATE TABLE IF NOT EXISTS')
    expect(query.mock.calls.filter(call => String(call[0]).startsWith('INSERT INTO'))).toHaveLength(3)
  })

  it('resets the window once it has expired', async () => {
    const { pool, state } = fakePool()
    const store = createPostgresRateLimitStore(async () => pool)
    await store.hit('expiring', 1, 1_000)
    state.windowStart = new Date(Date.now() - 5_000)
    expect((await store.hit('expiring', 1, 1_000)).allowed).toBe(true)
  })
})

describe('enforceRateLimit', () => {
  it('throws 429 once the limit is exceeded and sets Retry-After', async () => {
    const event = {} as never
    for (let i = 0; i < 3; i++) {
      await expect(enforceRateLimit(event, { keyPrefix: 'rl-block', max: 3, windowMs: 60_000 }))
        .resolves.toBeUndefined()
    }
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-block', max: 3, windowMs: 60_000 }))
      .rejects.toMatchObject({ statusCode: 429 })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Retry-After', expect.any(Number))
  })

  it('identifier participates in the key', async () => {
    const event = {} as never
    await enforceRateLimit(event, { keyPrefix: 'rl-id', max: 1, windowMs: 60_000, identifier: 'a@x.com' })
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-id', max: 1, windowMs: 60_000, identifier: 'b@x.com' }))
      .resolves.toBeUndefined()
  })

  it('uses an injected store (shared driver)', async () => {
    const hits = vi.fn(async () => ({ allowed: false, retryAfter: 7 }))
    resetRateLimitStore({ hit: hits })
    await expect(enforceRateLimit({} as never, { keyPrefix: 'injected', max: 1, windowMs: 1_000 }))
      .rejects.toMatchObject({ statusCode: 429 })
    expect(hits).toHaveBeenCalledWith('injected:1.2.3.4:', 1, 1_000)
  })
})
