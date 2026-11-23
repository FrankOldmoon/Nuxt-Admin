// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, useSlots, watch } from 'vue'
import { mount } from '@vue/test-utils'
import BusinessTable from '../../../app/components/dashboard/BusinessTable.vue'
import CrudTable from '../../../app/components/dashboard/crud/table.vue'

afterEach(() => vi.unstubAllGlobals())

describe('business tables reuse host pagination and actions', () => {
  it('hides generic mutations and selection even for an administrator', () => {
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('useSlots', useSlots)
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('useDashboardLabels', () => ({ fieldLabel: (_table: string, field: { label: string }) => field.label }))
    vi.stubGlobal('usePermission', () => ({ can: () => true }))
    const Table = defineComponent({ props: ['columns', 'data'], template: '<div />' })
    const wrapper = mount(CrudTable, {
      props: { business: true, items: [{ id: 1, amount: 300 }], visibleFields: [{ key: 'amount', type: 'number', label: '金额' }], meta: { table: 'finance', label: '财务', icon: '', fields: [], custom: true, features: { search: [], softDelete: false }, relationOptions: {} } },
      global: { components: { UTable: Table, UCard: defineComponent({ template: '<div><slot /></div>' }) }, stubs: ['DashboardCellRenderer', 'DashboardCrudRowActions', 'UCheckbox', 'UIcon', 'BasePaginationBar'] }
    })
    expect(wrapper.findComponent(Table).props('columns').map((c: { id?: string, accessorKey?: string }) => c.id ?? c.accessorKey)).toEqual(['amount'])
    wrapper.unmount()
  })
  it('sorts numbers, resets filtering to page one, and forwards the original action record', async () => {
    const Table = defineComponent({
      props: { items: Array, page: Number, pageSize: Number, pagination: Object, sort: Object, business: Boolean },
      emits: ['update:page', 'sort'],
      setup(props, { slots }) { return () => h('div', slots['table-actions']?.({ item: props.items[0] })) }
    })
    const items = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, amount: i + 1, name: `学生${i + 1}` }))
    const action = vi.fn()
    const wrapper = mount(BusinessTable, {
      props: { items, fields: [{ key: 'amount', label: '金额', type: 'number' }] },
      slots: { 'table-actions': ({ item }: { item: { id: number } }) => h('button', { onClick: () => action(item.id) }, '业务操作') },
      global: { components: { DashboardCrudTable: Table, UInput: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }) } }
    })
    const table = wrapper.findComponent(Table)
    expect(table.props('business')).toBe(true)
    expect(table.props('items')).toHaveLength(20)
    table.vm.$emit('update:page', 3)
    await nextTick()
    expect(table.props('items')).toHaveLength(5)
    await wrapper.find('input').setValue('学生1')
    await nextTick()
    expect(table.props('page')).toBe(1)
    expect(table.props('pagination').total).toBe(11)
    await wrapper.find('input').setValue('')
    table.vm.$emit('sort', { field: 'amount', order: 'desc' })
    await nextTick()
    expect(table.props('items')[0].amount).toBe(45)
    await wrapper.find('button').trigger('click')
    expect(action).toHaveBeenCalledWith(45)
    wrapper.unmount()
  })
})
