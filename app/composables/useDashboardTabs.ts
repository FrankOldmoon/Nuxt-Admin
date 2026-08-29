/**
 * Dashboard multi-tab state: tracks the /dashboard routes the user has
 * visited, caches titles, supports closing tabs; works with page keepalive
 * to preserve state.
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router'

export interface DashboardTab {
  path: string
  label: string
  /** Bound table (undefined for the /dashboard overview) */
  table?: string
  icon?: string
}

const MAX_TABS = 12

export function useDashboardTabs() {
  const tabs = useState<DashboardTab[]>('dashboard:tabs', () => [{ path: '/dashboard', label: 'Overview' }])

  const { data: metaData } = useDashboardMeta()
  const { menuLabel } = useDashboardLabels()

  /** Resolve tab info from the current route */
  function resolveTab(route: RouteLocationNormalizedLoaded): DashboardTab {
    // Static dashboard pages (files.vue / templates.vue / sessions.vue etc.)
    // don't live under /dashboard/[table], so they have no `table` route param.
    // Infer the table name from the last URL segment so their tabs get the real
    // label ("Files", "Templates") instead of falling back to "Overview".
    const paramTable = typeof route.params?.table === 'string' ? route.params.table : undefined
    let table = paramTable
    if (!table) {
      const last = route.path.split('/').filter(Boolean).pop()
      if (last && last !== 'dashboard') table = last
    }
    if (!table) {
      return { path: route.path, label: 'Overview' }
    }
    const item = metaData.value?.menu?.find(m => m.table === table)
    const label = item ? menuLabel(item) : table
    return { path: route.path, label, table, icon: item?.icon }
  }

  /** Add the current route as a tab (append if missing; evict the oldest ordinary tab when over the limit; overview is always kept) */
  function track(route: RouteLocationNormalizedLoaded, fallbackLabel?: string) {
    const tab = resolveTab(route)
    if (fallbackLabel && !tab.table) tab.label = fallbackLabel
    if (tabs.value.some(t => t.path === tab.path)) return
    const next = [...tabs.value, tab]
    if (next.length > MAX_TABS) {
      const idx = next.findIndex(t => t.path !== '/dashboard')
      if (idx !== -1) next.splice(idx, 1)
    }
    tabs.value = next
  }

  function close(path: string) {
    tabs.value = tabs.value.filter(t => t.path !== path || path === '/dashboard')
  }

  function isActive(path: string, route: RouteLocationNormalizedLoaded) {
    return route.path === path
  }

  return { tabs, track, close, isActive, resolveTab }
}
