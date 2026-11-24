// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, isRef, ref, useSlots } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import CrudPage from '../../../app/components/dashboard/crud/page.vue'

afterEach(() => vi.unstubAllGlobals())

it('preserves mutable form refs for existing create and edit hook consumers', async () => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useSlots', useSlots)
  vi.stubGlobal('onMounted', vi.fn())
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useDashboardLabels', () => ({ fieldLabel: (_table: string, field: { label: string }) => field.label, tableLabel: (_table: string, label: string) => label }))
  vi.stubGlobal('usePermission', () => ({ can: () => true }))
  vi.stubGlobal('useExcelExport', () => ({ exporting: ref(false), exportTableExcel: vi.fn() }))
  vi.stubGlobal('usePagedResource', () => ({ data: ref({ items: [] }), pending: ref(false), error: ref(null), page: ref(1), pageSize: ref(20), pagination: ref(null), trashed: ref(false), sort: ref(null), setTrashed: vi.fn(), setPage: vi.fn(), setPageSize: vi.fn(), setSort: vi.fn(), refresh: vi.fn() }))
  vi.stubGlobal('cGet', vi.fn().mockResolvedValue({ item: { id: 1, scopes: 'openid' } }))
  const wrapper = shallowMount(CrudPage, {
    props: { meta: { table: 'oauthClients', label: 'Clients', icon: '', fields: [], features: { search: [], softDelete: true }, relationOptions: {} } },
    global: { stubs: {
      UContainer: { template: '<div><slot /></div>' }, DashboardCrudHeader: true,
      DashboardCrudFilters: true, DashboardCrudTable: true, DashboardCrudFormModal: true,
      DashboardCrudDetailModal: true, DashboardCrudImport: true, UModal: true, UAlert: true,
      UButton: true, UIcon: true, UCheckbox: true, UInput: true, DashboardCrudForm: true
    } }
  })
  wrapper.findComponent({ name: 'DashboardCrudHeader' }).vm.$emit('create')
  const createForm = wrapper.emitted('before-create')?.[0]?.[0]
  expect(isRef(createForm)).toBe(true)
  if (!isRef(createForm)) throw Error('Expected a form ref')
  createForm.value = { scopes: 'openid profile email' }
  wrapper.findComponent({ name: 'DashboardCrudTable' }).vm.$emit('edit', { id: 1 })
  await flushPromises()
  const editForm = wrapper.emitted('before-edit')?.[0]?.[1]
  expect(editForm).toBe(createForm)
  expect(createForm.value).toEqual({ id: 1, scopes: 'openid' })
  wrapper.unmount()
})
