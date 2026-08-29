import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { mockFetch, captured } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  captured: [] as Array<{
    key: string
    handler: () => Promise<unknown>
    opts: { default?: () => unknown }
  }>
}))

mockNuxtImport('useRequestFetch', () => () => mockFetch)
mockNuxtImport('useAsyncData', () => (
  key: string,
  handler: () => Promise<unknown>,
  opts: { default?: () => unknown },
) => {
  captured.push({ key, handler, opts })
  return { data: ref(null), pending: ref(false), error: ref(null), refresh: vi.fn() }
})

import { useDashboardMeta } from '~/composables/useDashboardMeta'

describe('useDashboardMeta', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    captured.length = 0
  })

  it('registers useAsyncData under a fixed "dashboard:meta" key (centralized to avoid NUXT_E3004)', () => {
    useDashboardMeta()
    useDashboardMeta()
    expect(captured.map(c => c.key)).toEqual(['dashboard:meta', 'dashboard:meta'])
    // the options structure is the same across calls (both carry a default factory)
    expect(captured[0]!.opts.default).toBeTypeOf('function')
    expect(captured[1]!.opts.default).toBeTypeOf('function')
  })

  it('the default factory returns empty menu/tables as a fallback before data is ready', () => {
    useDashboardMeta()
    expect(captured[0]!.opts.default!()).toEqual({ menu: [], tables: [] })
  })

  it('the handler requests /api/dashboard/meta via GET and passes through the result', async () => {
    const meta = {
      menu: [{ table: 'users', label: 'Users', icon: 'i-users' }],
      tables: [{ table: 'users', label: 'Users', icon: 'i-users', custom: false }],
    }
    mockFetch.mockResolvedValue(meta)
    useDashboardMeta()
    const res = await captured[0]!.handler()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('/api/dashboard/meta', { method: 'GET', query: undefined })
    expect(res).toEqual(meta)
  })

  it('the handler passes through errors when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('boom'))
    useDashboardMeta()
    await expect(captured[0]!.handler()).rejects.toThrow('boom')
  })
})
