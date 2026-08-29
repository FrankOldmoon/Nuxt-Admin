// GET /api/dashboard/meta/[table]
// Returns TableMeta + preloaded relation option lists for `select` / `relation` fields.
// Admin-only.

import { createError, getRouterParams } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { attachOptions, loadRelationOptions } from '~~/server/utils/dashboard/crudService'
import type { TableMeta, TableMetaWithOptions } from '~/types/dashboard'

export default defineEventHandler(async (event): Promise<TableMetaWithOptions> => {
  const params = getRouterParams(event) as { table: string }
  await requireDashboardAccess(event, params.table)
  const tableName = params.table
  const meta: TableMeta | undefined = getTableMeta(tableName)
  if (!meta) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Unknown table: ${tableName}` })
  }
  const options = await loadRelationOptions(meta)
  return attachOptions(meta, options)
})
