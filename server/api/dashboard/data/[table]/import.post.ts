// POST /api/dashboard/data/[table]/import
// Generic batch-importer that accepts a 2D string[][] sheet payload and
// inserts each row into the target table via the shared crudService.
import { createError } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'
import { importSheetRows, toDataScopeActor } from '~~/server/utils/dashboard/crudService'

export default defineEventHandler(async (event) => {
  const table = getRouterParam(event, 'table')
  if (!table) throw createError({ statusCode: 400, message: 'Missing table' })
  const handler = getTableHandler(table)
  if (handler?.import) return handler.import(event)

  const actor = await requireDashboardAccess(event, table, 'create')
  const meta = getTableMeta(table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${table}` })

  const body = await readBody<{ rows?: string[][] }>(event)
  if (!body || !Array.isArray(body.rows)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: '"rows" (string[][]) body field is required',
    })
  }

  const result = await importSheetRows(meta, body.rows!, toDataScopeActor(actor))
  return result
})
