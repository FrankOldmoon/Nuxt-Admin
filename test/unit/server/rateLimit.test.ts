import { describe, it, expect, vi } from 'vitest'

const { getRequestIP, createError, setResponseHeader } = vi.hoisted(() => ({
  getRequestIP: vi.fn(() => '1.2.3.4'),
  createError: vi.fn((opts: any) => {
    const e: any = new Error(opts?.message || opts?.statusMessage || 'error')
    e.statusCode = opts?.statusCode
    e.statusMessage = opts?.statusMessage
    return e
  }),
  setResponseHeader: vi.fn()
}))
vi.mock('h3', () => ({ getRequestIP, createError }))
vi.stubGlobal('setResponseHeader', setResponseHeader)

import { enforceRateLimit } from '../../../server/utils/rateLimit'

describe('enforceRateLimit', () => {
  it('multiple calls within the limit pass', async () => {
    const event = {} as never
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-pass', max: 3, windowMs: 60_000 })).resolves.toBeUndefined()
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-pass', max: 3, windowMs: 60_000 })).resolves.toBeUndefined()
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-pass', max: 3, windowMs: 60_000 })).resolves.toBeUndefined()
  })

  it('throws 429 once the limit is exceeded', async () => {
    const event = {} as never
    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(event, { keyPrefix: 'rl-block', max: 3, windowMs: 60_000 })
    }
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-block', max: 3, windowMs: 60_000 }))
      .rejects.toMatchObject({ statusCode: 429 })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Retry-After', expect.any(Number))
  })

  it('identifier participates in the rate-limit key', async () => {
    const event = {} as never
    await enforceRateLimit(event, { keyPrefix: 'rl-id', max: 1, windowMs: 60_000, identifier: 'a@x.com' })
    // a different identifier is unaffected
    await expect(enforceRateLimit(event, { keyPrefix: 'rl-id', max: 1, windowMs: 60_000, identifier: 'b@x.com' })).resolves.toBeUndefined()
  })
})