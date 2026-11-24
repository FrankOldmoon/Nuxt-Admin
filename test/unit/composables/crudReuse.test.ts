import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, watch } from 'vue'
import { usePermission } from '../../../app/composables/usePermission'
import { usePagedResource } from '../../../app/composables/usePagedResource'

afterEach(() => vi.unstubAllGlobals())

describe('module CRUD reuse', () => {
  it('uses canonical module grants without enabling other actions or admin tables', () => {
    const user = ref({ id: 2, role: { name: 'teacher', permissions: ['sms.students.read', 'sms.students.update'] } })
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useAuth', () => ({ user }))
    const { can } = usePermission()
    const meta = { table: 'students', permissions: { read: 'sms.students.read', update: 'sms.students.update', delete: 'sms.students.delete' } }
    expect(can(meta, 'read')).toBe(true)
    expect(can(meta, 'update')).toBe(true)
    expect(can(meta, 'delete')).toBe(false)
    expect(can({ table: 'classes', permissions: { read: 'sms.classes.read' } }, 'read')).toBe(false)
    user.value.role.permissions = ['*']
    expect(can('users', 'read')).toBe(false)
    user.value.role.permissions = ['students:read']
    expect(can(meta, 'read')).toBe(true)
    expect(can(meta, 'update')).toBe(false)
  })

  it('resets pagination on filters and ignores stale in-flight responses', async () => {
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onMounted', () => {})
    const requests: { url: string, resolve: (value: unknown) => void }[] = []
    vi.stubGlobal('$fetch', (url: string) => new Promise(resolve => requests.push({ url, resolve })))
    const scope = effectScope()
    try {
      const filters = ref<Record<string, string>>({})
      const resource = scope.run(() => usePagedResource('students', '/api/dashboard/data/students', filters))!
      resource.setPage(10)
      await nextTick()
      filters.value = { classId: '1' }
      await nextTick()
      expect(resource.page.value).toBe(1)
      expect(requests[1]!.url).toContain('classId=1')
      requests[1]!.resolve({ items: [{ id: 1 }], pagination: { total: 34, page: 1, pageSize: 10 } })
      await nextTick()
      requests[0]!.resolve({ items: [{ id: 999 }], pagination: { total: 1000, page: 10, pageSize: 10 } })
      await nextTick()
      expect(resource.data.value?.items).toEqual([{ id: 1 }])
      expect(resource.pagination.value?.total).toBe(34)
    } finally {
      scope.stop()
    }
  })
})
