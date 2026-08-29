// POST /api/dashboard/data/[table]
import { createError, getRouterParams, readBody } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'
import { insertRow, toDataScopeActor } from '~~/server/utils/dashboard/crudService'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { table: string }
  const handler = getTableHandler(params.table)
  if (handler?.create) return handler.create(event)

  const actor = await requireDashboardAccess(event, params.table, 'create')
  const meta = getTableMeta(params.table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${params.table}` })
  if (meta.custom) {
    throw createError({ statusCode: 405, message: `Custom table "${params.table}" not allowed via generic API` })
  }
  const body = await readBody<Record<string, unknown>>(event) ?? {}
  const row = await insertRow(meta, body, toDataScopeActor(actor))
  return { item: row }
})
