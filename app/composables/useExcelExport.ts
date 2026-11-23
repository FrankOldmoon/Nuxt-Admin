/**
 * Generic Excel export composable — shared by all dashboard tables.
 *
 * Consistent with the original export logic in users.vue:
 *   1. Dynamically load the installed SheetJS package
 *   2. Call the scoped export API to fetch matching data
 *   3. Use meta.fields for header mapping, generate the .xlsx file and trigger a download
 */
import type { AdvancedFilterCondition, TableMeta, TableMetaWithOptions } from '~/types/dashboard'

export function useExcelExport() {
  const toast = useToast()
  const { t } = useI18n()
  const exporting = ref(false)

  /**
   * Export all data of the given table as .xlsx.
   *
   * @param meta        table metadata (determines headers + field mapping)
   * @param baseUrl     base list API path, e.g. `/api/dashboard/data/users`
   * @param filters     current filters (passed as query params to the API)
   * @param trashed     whether we are in trash mode
   * @param mapRow      optional custom row mapper (users table uses it for custom columns/format)
   */
  async function exportTableExcel(
    meta: TableMeta & Partial<Pick<TableMetaWithOptions, 'relationOptions'>>,
    baseUrl: string,
    filters: Record<string, string> = {},
    trashed = false,
    mapRow?: (row: Record<string, unknown>) => Record<string, unknown>,
    conditions: AdvancedFilterCondition[] = [],
    sort?: { field: string, order: 'asc' | 'desc' } | null
  ) {
    exporting.value = true
    try {
      const XLSX = await import('xlsx')
      const params = new URLSearchParams()
      params.set('format', 'json')
      if (conditions.length) params.set('conditions', JSON.stringify(conditions))
      if (sort) {
        params.set('sort', sort.field)
        params.set('order', sort.order)
      }
      if (trashed) params.set('trashed', 'true')
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v)
      }
      const qs = params.toString()
      const url = `${baseUrl}/export?${qs}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || res.statusText || 'Export failed')
      }
      const rows = await res.json() as Record<string, unknown>[]

      // Build headers: take showInTable fields, use their label as column name
      const fields = meta.fields.filter(f => f.showInTable && f.type !== 'many-to-many')
      const headers = fields.map(f => f.label)

      let data: Record<string, unknown>[]
      if (mapRow) {
        data = rows.map(mapRow)
      } else {
        data = rows.map((row) => {
          const obj: Record<string, unknown> = {}
          fields.forEach((f) => {
            const raw = row[f.key]
            const options = meta.relationOptions?.[f.key] ?? f.options
            const option = options?.find(o => String(o.value) === String(raw))
            // Format date/time and relation labels using the same metadata as the table.
            if (raw && (f.type === 'datetime' || f.type === 'date')) {
              try {
                obj[f.label] = new Date(raw as string).toLocaleString()
              } catch {
                obj[f.label] = raw
              }
            } else if (raw === null || raw === undefined) {
              obj[f.label] = ''
            } else {
              obj[f.label] = option?.label ?? raw
            }
          })
          return obj
        })
      }

      const ws = XLSX.utils.json_to_sheet(data, { header: headers })
      const wb = XLSX.utils.book_new()
      const sheetName = (meta.label || meta.table).slice(0, 31) || 'Sheet'
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      const filename = `${meta.table}-${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, filename)
      toast.add({ title: t('dashboard.excel.exportOk'), color: 'success' })
    } catch (e: unknown) {
      toast.add({ title: extractErrorMessage(e, t('dashboard.excel.exportFailed')), color: 'error' })
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportTableExcel }
}
