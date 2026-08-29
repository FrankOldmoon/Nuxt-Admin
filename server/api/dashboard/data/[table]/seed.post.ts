// POST /api/dashboard/data/[table]/seed
// Generic type-driven seeder: inserts `count` rows generated from the table's
// field metadata (FieldMeta.type), picking relation/select values from the
// related tables. A per-table `seed` override (registered in tableOverrides)
// supersedes this generic behaviour when present.
//
// Body: { count?: number }   (default 10, clamped to [1, 100])
import { createError, getRouterParam, readBody } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import { getTableMeta } from '~~/server/utils/dashboard/tables'
import { getTableHandler } from '~~/server/utils/dashboard/tableOverrides'
import { seedTable, toDataScopeActor } from '~~/server/utils/dashboard/crudService'

export default defineEventHandler(async (event) => {
  const table = getRouterParam(event, 'table')
  if (!table) throw createError({ statusCode: 400, message: 'Missing table' })

  const handler = getTableHandler(table)
  if (handler?.seed) return handler.seed(event)

  const actor = await requireDashboardAccess(event, table, 'create')
  const meta = getTableMeta(table)
  if (!meta) throw createError({ statusCode: 404, message: `Unknown table: ${table}` })
  if (meta.custom) {
    throw createError({ statusCode: 405, message: `Custom table "${table}" cannot be seeded via generic API` })
  }

  const body = await readBody<Record<string, unknown>>(event).catch(() => undefined)
  const count = Math.min(100, Math.max(1, Number(body?.count ?? 10) || 10))

  const ids = await seedTable(meta, count, toDataScopeActor(actor))
  return { ok: true, table, inserted: ids.length, ids }
})