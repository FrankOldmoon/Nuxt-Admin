// GET /api/dashboard/data/[table]/[id]
import { createError, getRouterParams } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'
import { getById, toDataScopeActor, enrichFileFields } from '~~/server/utils/dashboard/crudService'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { table: string, id: string }
  const handler = getTableHandler(params.table)
  if (handler?.getOne) return handler.getOne(event)

  const actor = await requireDashboardAccess(event, params.table, 'read')
  const meta = getTableMeta(params.table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${params.table}` })
  if (meta.custom) {
    throw createError({ statusCode: 405, message: `Custom table "${params.table}" not allowed via generic API` })
  }
  const idNum = /^\d+$/.test(params.id) ? Number(params.id) : params.id
  const row = await getById(meta, idNum, toDataScopeActor(actor))
  if (!row) throw createError({ statusCode: 404, message: 'Record not found' })
  const [enriched] = await enrichFileFields(meta, [row])
  return { item: enriched }
})
