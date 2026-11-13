// GET /api/dashboard/data/[table]/export
// Generic exporter: streams all rows (respecting current filters/search).
//   - default: UTF-8 CSV with BOM so Excel displays Chinese correctly
//   - ?format=json: returns the raw matching rows as a JSON array
import { createError } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getExposedTableMeta } from '~~/server/utils/dashboard/tables'
import {
  listTableData,
  loadRelationOptions,
  parsePageQuery,
  rowsToSheetRows,
  toDataScopeActor,
} from '~~/server/utils/dashboard/crudService'
import { writeAudit } from '~~/server/core/audit'
import { db } from '~~/server/database'

function csvEscape(v: string): string {
  const needsQuotes = /[",\n\r]/.test(v)
  const escaped = v.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export default defineEventHandler(async (event) => {
  const table = getRouterParam(event, 'table')
  if (!table) throw createError({ statusCode: 400, message: 'Missing table' })
  const actor = await requireDashboardAccess(event, table, 'read')
  const meta = getExposedTableMeta(table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${table}` })
  if (meta.custom) {
    throw createError({ statusCode: 405, message: `Custom table "${table}" cannot be exported via generic API` })
  }

  const query = getQuery(event) as Record<string, unknown>
  const { search, filters, sort } = parsePageQuery(query, meta)
  const format = query.format === 'json' ? 'json' : 'csv'
  const trashed = query.trashed === 'true' || query.trashed === '1'

  // Pull *all* matching rows — pagination is intentionally bypassed for export.
  // We cap at 50k to keep memory bounded; callers can paginate-export via CSV
  // on their side if they need larger datasets.
  const EXPORT_LIMIT = 50_000
  const scopeActor = toDataScopeActor(actor)
  const { rows } = await listTableData(meta, {
    offset: 0,
    limit: EXPORT_LIMIT,
    trashed,
    search,
    filters,
    sort,
  }, scopeActor)

  await writeAudit(db, {
    actorUserId: scopeActor?.userId,
    tenantId: scopeActor?.tenantId,
    organizationId: scopeActor?.organizationId,
    action: 'export',
    resource: table,
    after: { format, count: rows.length },
    source: 'dashboard-export'
  })

  // JSON format: return the raw matching rows as-is (respects filters/search).
  if (format === 'json') {
    setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    setHeader(
      event,
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(table)}_${new Date().toISOString().slice(0, 10)}.json"`,
    )
    return rows
  }

  const options = await loadRelationOptions(meta, scopeActor)
  const { headers, sheet } = rowsToSheetRows(meta, rows as Record<string, unknown>[], options)

  const lines: string[] = [headers.map(csvEscape).join(',')]
  for (const r of sheet) lines.push(r.map(csvEscape).join(','))
  const body = '\uFEFF' + lines.join('\r\n')

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(table)}_${new Date().toISOString().slice(0, 10)}.csv"`,
  )
  return body
})
