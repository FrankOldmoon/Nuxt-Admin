// POST /api/dashboard/data/[table]/batch
// body: { action: 'soft-delete' | 'restore' | 'permanent-delete', ids: [] }
import { createError, getRouterParams, readBody } from 'h3'
import { requireDashboardAccess, type TableAction } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'
import { applyBatch, toDataScopeActor } from '~~/server/utils/dashboard/crudService'
import type { BatchAction } from '~/types/dashboard'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { table: string }
  const handler = getTableHandler(params.table)
  if (handler?.batch) return handler.batch(event)

  const body = (await readBody(event) ?? {}) as Partial<BatchAction>
  const action = body.action
  if (!action || !['soft-delete', 'restore', 'permanent-delete'].includes(action)) {
    throw createError({ statusCode: 400, message: 'Invalid batch action' })
  }
  // restore is an update operation; delete-type actions map to delete
  const permAction: TableAction = action === 'restore' ? 'update' : 'delete'
  const actor = await requireDashboardAccess(event, params.table, permAction)
  const meta = getTableMeta(params.table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${params.table}` })
  if (meta.custom) {
    throw createError({ statusCode: 405, message: `Custom table "${params.table}" not allowed via generic API` })
  }
  const ids = Array.isArray(body.ids) ? body.ids : []
  const affected = await applyBatch(meta, action, ids, toDataScopeActor(actor))
  return { ok: true, action, affected }
})
