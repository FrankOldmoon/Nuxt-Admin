// PUT /api/dashboard/data/[table]/[id]
import { createError, getRouterParams, readBody } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'
import { updateRow, toDataScopeActor } from '~~/server/utils/dashboard/crudService'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { table: string, id: string }
  const handler = getTableHandler(params.table)
  if (handler?.update) return handler.update(event)

  const actor = await requireDashboardAccess(event, params.table, 'update')
  const meta = getTableMeta(params.table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${params.table}` })
  if (meta.custom) {
    throw createError({ statusCode: 405, message: `Custom table "${params.table}" not allowed via generic API` })
  }
  const idNum = /^\d+$/.test(params.id) ? Number(params.id) : params.id
  const body = await readBody<Record<string, unknown>>(event) ?? {}
  const row = await updateRow(meta, idNum, body, toDataScopeActor(actor))
  if (!row) throw createError({ statusCode: 404, message: 'Record not found' })
  return { item: row }
})
