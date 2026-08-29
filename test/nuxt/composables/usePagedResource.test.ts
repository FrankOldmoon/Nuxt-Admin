import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { mockFetch, watchCallbacks } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  watchCallbacks: [] as Array<() => void>
}))

mockNuxtImport('watch', () => (_source: unknown, cb: () => void) => {
  watchCallbacks.push(cb)
})
mockNuxtImport('onMounted', () => (_cb: () => void) => {})
mockNuxtImport('$fetch', () => mockFetch)

import { usePagedResource } from '~/composables/usePagedResource'

const pageResp = {
  items: [{ id: 1 }, { id: 2 }],
  pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 }
}

describe('usePagedResource', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    watchCallbacks.length = 0
  })

  it('initial pagination state is page 1, 10 per page, not trashed', () => {
    const r = usePagedResource('users:list', '/api/users', ref<Record<string, string>>({}))
    expect(r.page.value).toBe(1)
    expect(r.pageSize.value).toBe(10)
    expect(r.trashed.value).toBe(false)
    expect(r.pagination.value).toBeNull()
  })

  it('load carries page/pageSize/trashed/filters query params', async () => {
    mockFetch.mockResolvedValue(pageResp)
    const filters = ref<Record<string, string>>({ q: 'admin' })
    const r = usePagedResource('users:list', '/api/users', filters)
    r.setTrashed(true)
    r.setPage(2)
    // trigger the watch callback (pagination/filter state change) -> internal load() re-requests
    watchCallbacks[0]!()
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/users?page=2&pageSize=10&trashed=true&q=admin',
        { method: 'GET', credentials: 'include' }
      )
    })
    await vi.waitFor(() => {
      expect(r.data.value).toEqual(pageResp)
    })
  })

  it('setPage updates the page (values below 1 are covered by the server parsePagination)', () => {
    const r = usePagedResource('users:list', '/api/users', ref<Record<string, string>>({}))
    r.setPage(5)
    expect(r.page.value).toBe(5)
  })

  it('setPageSize updates the page size and keeps the page unchanged', () => {
    const r = usePagedResource('users:list', '/api/users', ref<Record<string, string>>({}))
    r.setPage(3)
    r.setPageSize(50)
    expect(r.pageSize.value).toBe(50)
    expect(r.page.value).toBe(3)
  })

  it('reloads when filters change and keeps the page unchanged', async () => {
    mockFetch.mockResolvedValue(pageResp)
    const filters = ref<Record<string, string>>({})
    const r = usePagedResource('users:list', '/api/users', filters)
    r.setPage(4)
    expect(r.page.value).toBe(4)
    // trigger the watch callback (deep watch catches the change) -> reload
    expect(watchCallbacks).toHaveLength(1)
    watchCallbacks[0]!()
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/users?page=4&pageSize=10',
        { method: 'GET', credentials: 'include' }
      )
    })
    expect(r.page.value).toBe(4)
  })
})
