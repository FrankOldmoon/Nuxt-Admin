// POST /api/dashboard/data/[table]/upload
// Dispatches to a registered `TableCrudHandler.upload` hook (e.g. files).
// Generic tables without an upload hook get a 405 instead of a 404.
import { createError, getRouterParams } from 'h3'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { table: string }
  const handler = getTableHandler(params.table)
  if (handler?.upload) return handler.upload(event)
  throw createError({
    statusCode: 405,
    message: `Table "${params.table}" does not support a direct upload endpoint`
  })
})