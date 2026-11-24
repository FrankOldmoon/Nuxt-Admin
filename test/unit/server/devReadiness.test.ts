import { describe, expect, it, vi } from 'vitest'
import { probeReady, waitForReady } from '../../../scripts/dev-readiness.mjs'

describe('development readiness', () => {
  it('does not announce ready when only the API works or a dev error page is returned', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ checks: { database: 'ok' } }))
      .mockResolvedValueOnce(new Response('Dev server unavailable', { status: 503 }))
    expect(await probeReady('http://local', fetcher)).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('accepts a healthy database, rendered login and protected SMS route', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ checks: { database: 'ok' } }))
      .mockResolvedValueOnce(new Response('<div id="__nuxt"></div>'))
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/login?redirect=/zh-CN/sms' } }))
    expect(await probeReady('http://local', fetcher, undefined, '/zh-CN/sms')).toBe(true)
    expect(fetcher.mock.calls[2]?.[0]).toBe('http://local/zh-CN/sms')
  })
  it('checks the configured host page without requiring the SMS layer', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ checks: { database: 'ok' } }))
      .mockResolvedValueOnce(new Response('<div id="__nuxt"></div>'))
      .mockResolvedValueOnce(new Response('<main>Home</main>'))
    expect(await probeReady('http://local', fetcher)).toBe(true)
    expect(fetcher.mock.calls[2]?.[0]).toBe('http://local/')
  })
  it('rejects a degraded database and stops when cancelled', async () => {
    expect(await probeReady('http://local', vi.fn().mockResolvedValue(Response.json({ checks: { database: 'error' } })))).toBe(false)
    const controller = new AbortController()
    controller.abort()
    expect(await waitForReady('http://local', { signal: controller.signal })).toBe(false)
  })
})
