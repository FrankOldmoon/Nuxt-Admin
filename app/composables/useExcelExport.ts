/**
 * Generic Excel export composable — shared by all dashboard tables.
 *
 * Consistent with the original export logic in users.vue:
 *   1. Dynamically load SheetJS (xlsx CDN)
 *   2. Call the list API to fetch all data
 *   3. Use meta.fields for header mapping, generate the .xlsx file and trigger a download
 */
import type { TableMeta } from '~/types/dashboard'

let xlsxLoaded = false

function loadXlsx(): Promise<boolean> {
  if (xlsxLoaded && (window as any).XLSX) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
    script.onload = () => { xlsxLoaded = true; resolve(true) }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

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
    meta: TableMeta,
    baseUrl: string,
    filters: Record<string, string> = {},
    trashed = false,
    mapRow?: (row: Record<string, unknown>) => Record<string, unknown>,
  ) {
    exporting.value = true
    try {
      const ok = await loadXlsx()
      if (!ok) {
        toast.add({ title: t('dashboard.excel.libLoadFailed'), color: 'error' })
        return
      }
      // Fetch all data (pageSize=9999, same as in users.vue)
      const params = new URLSearchParams()
      params.set('pageSize', '9999')
      if (trashed) params.set('trashed', 'true')
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v)
      }
      const qs = params.toString()
      const url = `${baseUrl}${qs ? `?${qs}` : ''}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || res.statusText || 'Export failed')
      }
      const json = await res.json() as { items?: Record<string, unknown>[] }
      const rows = json.items ?? []

      const XLSX = (window as any).XLSX

      // Build headers: take showInTable fields, use their label as column name
      const fields = meta.fields.filter((f: any) => f.showInTable && f.type !== 'many-to-many')
      const headers = fields.map((f: any) => f.label)

      let data: Record<string, unknown>[]
      if (mapRow) {
        data = rows.map(mapRow)
      } else {
        data = rows.map(row => {
          const obj: Record<string, unknown> = {}
          fields.forEach((f: any) => {
            const raw = row[f.key]
            // Format date/time
            if (raw && (f.type === 'datetime' || f.type === 'date')) {
              try { obj[f.label] = new Date(raw as string).toLocaleString() } catch { obj[f.label] = raw }
            } else if (raw === null || raw === undefined) {
              obj[f.label] = ''
            } else {
              obj[f.label] = raw
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
