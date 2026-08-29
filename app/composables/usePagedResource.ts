/**
 * Minimal paged resource composable (replacement for custom usePagedResource).
 *
 * Mirrors the shape expected by BaseCrudPage + DashboardCrudPage:
 *   data, pending, page, pageSize, pagination, trashed
 *   setPage, setPageSize, setTrashed(boolean), refresh
 *
 * Built on $fetch so SSR + client hydration work out of the box,
 * and useLazyAsyncData not required since we run load() at setup on SSR.
 */
import type { PaginationMeta } from '~/types/pagination'

/** Raw pagination shape returned by the generic dashboard data API */
interface DBPaginationMeta {
  page?: number | string
  pageSize?: number | string
  total?: number | string
  totalPages?: number | string
}

type ResultShape<T> = { items: T[]; pagination: DBPaginationMeta }

function normalizePagination(db?: DBPaginationMeta | null): PaginationMeta | null {
  if (!db) return null
  const total = Number(db.total ?? 0)
  const page = Number(db.page ?? 1)
  const pageSize = Number(db.pageSize ?? 20)
  const totalPages = Math.max(1, pageSize > 0 ? Math.ceil(total / pageSize) : 1)
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  }
}

export function usePagedResource<T extends ResultShape<Record<string, unknown>>>(
  _key: string,
  baseUrl: string,
  filters: globalThis.Ref<Record<string, string>>,
  /** Structured advanced conditions — serialised to `conditions` query param as JSON */
  conditions: globalThis.Ref<unknown[] | undefined> = ref(undefined),
  /** Sort state — serialised to `sort` + `order` query params */
  sort: globalThis.Ref<{ field: string; order: 'asc' | 'desc' } | null> = ref(null),
  defaultPageSize = 10
) {
  const page = ref<number>(1)
  const pageSize = ref<number>(defaultPageSize)
  const trashed = ref<boolean>(false)

  const query = computed(() => {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    if (trashed.value) params.set('trashed', 'true')
    for (const [k, v] of Object.entries(filters.value || {})) {
      if (v !== '' && v != null) params.set(k, String(v))
    }
    const conds = conditions.value
    if (Array.isArray(conds) && conds.length > 0) {
      // Drop conditions that have no operator value but require one (avoids
      // spamming the server with incomplete rows while the user is typing).
      const meaningful = conds.filter(c => {
        const row = c as Record<string, unknown>
        if (!row.op || !row.field) return false
        const noValueOps = ['isNull', 'isNotNull', 'isEmpty', 'isNotEmpty']
        if (noValueOps.includes(String(row.op))) return true
        const val = row.value
        if (Array.isArray(val)) return val.some(x => x !== '' && x != null)
        return val !== '' && val != null
      })
      if (meaningful.length) params.set('conditions', JSON.stringify(meaningful))
    }
    if (sort.value) {
      params.set('sort', sort.value.field)
      params.set('order', sort.value.order)
    }
    return params.toString()
  })

  const pending = ref(false)
  const latestRev = ref(0)
  const rawData = ref<T | null>(null)
  const error = ref<Error | null>(null)

  async function load(quiet = false) {
    const rev = ++latestRev.value
    if (!quiet) pending.value = true
    error.value = null
    try {
      const qs = query.value
      const url = qs ? `${baseUrl}?${qs}` : baseUrl
      const body = await $fetch<T>(url, { method: 'GET', credentials: 'include' })
      if (rev === latestRev.value) rawData.value = body
    } catch (e: any) {
      if (rev === latestRev.value) error.value = e
    } finally {
      if (rev === latestRev.value && !quiet) pending.value = false
    }
  }

  watch([page, pageSize, trashed, filters, conditions, sort], () => { load() }, { deep: true })

  onMounted(() => {
    if (!rawData.value?.pagination) load()
  })

  function setPage(p: number) { page.value = p }
  function setPageSize(s: number) { pageSize.value = s }
  function setTrashed(t: boolean) { trashed.value = t }
  function setSort(s: { field: string; order: 'asc' | 'desc' } | null) { sort.value = s }
  /** re-fetch. Pass `quiet=true` to keep current rows on screen (no loading flash). */
  function refresh(quiet = false) { load(quiet) }

  const pagination = computed<PaginationMeta | null>(() => normalizePagination(rawData.value?.pagination))
  const data = computed(() => rawData.value)

  return {
    data,
    pending,
    error,
    page,
    pageSize,
    pagination,
    trashed,
    sort,
    setPage,
    setPageSize,
    setTrashed,
    setSort,
    refresh
  } as const
}
