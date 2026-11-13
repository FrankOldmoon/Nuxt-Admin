// GET /api/dashboard/modules
// Core-level module inventory: manifest metadata, persisted lifecycle state and
// migration history. Admin-only; body is a plain DTO (never the live module
// definitions, which contain functions).
import { requireAdmin } from '~~/server/utils/auth'
import { MODULE_DEFINITIONS, AVAILABLE_MODULE_IDS, resolveEnabledModuleIds } from '~~/modules.catalog'
import { CORE_VERSION, MODULE_API_VERSION, validateModuleManifests } from '~~/server/core/moduleManifest'
import { db, pool } from '~~/server/database'
import { moduleStates } from '~~/server/database/schema'

interface MigrationHistoryEntry {
  id: string
  moduleVersion: string | null
  status: string
  appliedAt: string | null
  durationMs: number | null
  error: string | null
}

export interface ModuleManagementItem {
  id: string
  name: string
  version: string
  apiVersion: string
  compatibility: { core?: string }
  enabled: boolean
  dependencies: readonly string[]
  dependencyRanges: Readonly<Record<string, string>>
  permissions: readonly string[]
  capabilities: Readonly<Record<string, boolean>>
  migrationScope: string
  navigation: ReadonlyArray<{ id: string, label: string, to: string }>
  database: readonly string[]
  api: readonly string[]
  tools: readonly string[]
  components: readonly string[]
  state: {
    state: string
    version: string
    error: string | null
    updatedAt: string | null
  } | null
  migrations: MigrationHistoryEntry[]
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const enabledIds = new Set(resolveEnabledModuleIds())

  const states = new Map(
    (await db.select().from(moduleStates)).map(row => [row.moduleId, row])
  )

  const history = new Map<string, MigrationHistoryEntry[]>()
  try {
    const { rows } = await pool.query(
      `SELECT "id", "module_id", "module_version", "status", "applied_at", "duration_ms", "last_error"
         FROM "__module_migrations"
        ORDER BY "applied_at" NULLS LAST, "id"`
    )
    for (const row of rows as Array<Record<string, unknown>>) {
      const moduleId = String(row.module_id ?? '')
      const list = history.get(moduleId) ?? []
      list.push({
        id: String(row.id),
        moduleVersion: row.module_version ? String(row.module_version) : null,
        status: String(row.status ?? 'applied'),
        appliedAt: row.applied_at ? new Date(row.applied_at as string).toISOString() : null,
        durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
        error: row.last_error ? String(row.last_error) : null
      })
      history.set(moduleId, list)
    }
  } catch {
    // Migration history table is created lazily on first migration run.
  }

  let validationError: string | null = null
  try {
    validateModuleManifests(MODULE_DEFINITIONS)
  } catch (error) {
    validationError = error instanceof Error ? error.message : String(error)
  }

  const modules: ModuleManagementItem[] = MODULE_DEFINITIONS.map((module) => {
    const persisted = states.get(module.id)
    return {
      id: module.id,
      name: module.name,
      version: module.version,
      apiVersion: module.apiVersion ?? MODULE_API_VERSION,
      compatibility: { core: module.compatibility?.core },
      enabled: enabledIds.has(module.id),
      dependencies: module.dependencies,
      dependencyRanges: module.dependencyRanges ?? {},
      permissions: module.permissions,
      capabilities: module.capabilities ?? {},
      migrationScope: module.migrationScope ?? 'global',
      navigation: module.navigation.map(item => ({ id: item.id, label: String(item.label), to: String(item.to) })),
      database: module.database,
      api: module.api,
      tools: module.tools,
      components: module.components,
      state: persisted
        ? {
            state: persisted.state,
            version: persisted.version,
            error: persisted.lastError,
            updatedAt: persisted.updatedAt ? new Date(persisted.updatedAt).toISOString() : null
          }
        : null,
      migrations: history.get(module.id) ?? []
    }
  })

  return {
    coreVersion: CORE_VERSION,
    apiVersion: MODULE_API_VERSION,
    validation: { ok: validationError === null, error: validationError },
    availableModuleIds: AVAILABLE_MODULE_IDS,
    enabledModuleIds: [...enabledIds],
    modules
  }
})
