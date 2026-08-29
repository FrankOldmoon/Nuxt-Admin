// GET /api/dashboard/data/[table]    (generic list)
// Query params: page, pageSize, trashed, search, & any exact-match column filter
// Admin-only.  Custom tables return 405.

import { createError, getRouterParams, getQuery } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { listTableData, parsePageQuery, toDataScopeActor, enrichFileFields } from '~~/server/utils/dashboard/crudService'
import { parsePagination, buildPagination } from '~~/server/utils/pagination'
import { getTableHandler, applyListOverrides } from '~~/server/utils/dashboard/tableOverrides'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { table: string }
  // Full-table takeover (users/files): the override enforces its own auth.
  const handler = getTableHandler(params.table)
  if (handler?.list) return handler.list(event)

  const actor = await requireDashboardAccess(event, params.table, 'read')
  const meta = getTableMeta(params.table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${params.table}` })
  if (meta.custom) {
    throw createError({
      statusCode: 405,
      message: `Table "${params.table}" uses custom API: ${meta.customApi ?? '(unknown)'}`
    })
  }

  const { page, pageSize, offset, limit } = parsePagination(event)
  const query = getQuery(event) as Record<string, unknown>
  const { search, filters, conditions, sort } = parsePageQuery(query, meta)
  const trashed = query.trashed === 'true' && meta.features.softDelete

  const { rows, total } = await listTableData(meta, { offset, limit, trashed, search, filters, conditions, sort }, toDataScopeActor(actor))

  // Per-table list enrichment is delegated to the override registry
  // (server/utils/dashboard/tableOverrides/<table>.ts) — adding a custom list
  // API for a new table requires only that single file, never a change here.
  const items = await enrichFileFields(meta, await applyListOverrides(params.table, rows, meta))

  return {
    items,
    pagination: buildPagination(page, pageSize, total)
  }
})
