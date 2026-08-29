import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import Logo from '~/components/app/logo.vue'
import PaginationBar from '~/components/base/paginationBar.vue'

mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (key === 'pagination.total') return `Total ${params?.total}`
    if (key === 'pagination.range') return `Rows ${params?.from}-${params?.to}`
    if (key === 'pagination.page') return '/page'
    return key
  }
}))

describe('basic component rendering', () => {
  it('logo renders as an SVG', async () => {
    const wrapper = await mountSuspended(Logo)
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 1020 200')
  })

  it('paginationBar shows the total when total>0', async () => {
    const wrapper = await mountSuspended(PaginationBar, {
      props: {
        pagination: { page: 1, pageSize: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: false },
        page: 1,
        pageSize: 10
      }
    })
    expect(wrapper.text()).toContain('Total 25')
    expect(wrapper.text()).toContain('Rows 1-10')
  })

  it('paginationBar does not render when total=0', async () => {
    const wrapper = await mountSuspended(PaginationBar, {
      props: { pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false }, page: 1, pageSize: 10 }
    })
    expect(wrapper.text()).not.toContain('Total 0')
  })
})