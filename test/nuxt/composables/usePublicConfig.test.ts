import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { mockFetch, capturedHandlers } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  capturedHandlers: [] as Array<() => Promise<unknown>>
}))

mockNuxtImport('useRequestFetch', () => () => mockFetch)
mockNuxtImport('useAsyncData', () => (key: string, handler: () => Promise<unknown>, _opts?: { default?: () => unknown }) => {
  capturedHandlers.push(handler)
  return { data: ref(null), pending: ref(false), refresh: vi.fn(), error: ref(null) }
})

import { usePublicConfig } from '~/composables/usePublicConfig'

describe('usePublicConfig', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    capturedHandlers.length = 0
  })

  it('requests /api/config/public under the config:public key', async () => {
    mockFetch.mockResolvedValue({ configs: { 'site.title': 'Nuxt AI' } })
    usePublicConfig()
    expect(capturedHandlers).toHaveLength(1)
    const res = await capturedHandlers[0]!()
    expect(mockFetch).toHaveBeenCalledWith('/api/config/public', { method: 'GET', query: undefined })
    expect(res).toEqual({ configs: { 'site.title': 'Nuxt AI' } })
  })

  it('the handler throws when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    usePublicConfig()
    await expect(capturedHandlers[0]!()).rejects.toThrow('network down')
  })
})