/**
 * Shared composable for loading dashboard sidebar/menu metadata.
 *
 * Centralises the `useAsyncData('dashboard:meta', …)` call so that every
 * component (shell.vue, [table].vue, menuEditor.vue) shares the same
 * handler reference — fixes NUXT_E3004 "Incompatible options detected
 * for dashboard:meta".
 */
import type { DashboardMeta } from '~/types/dashboard'

export function useDashboardMeta() {
  return useAsyncData<DashboardMeta>(
    'dashboard:meta',
    () => cGet<DashboardMeta>('/api/dashboard/meta'),
    { default: () => ({ menu: [], tables: [] }) },
  )
}
