import { resolveModules } from '../core/moduleSdk'
import { MODULE_DEFINITIONS, resolveEnabledModuleIds } from '../../modules.catalog'
import { db } from '../database'
import { recordModuleState } from '../database/moduleStates'
import { registerEnabledModuleServices } from '../utils/moduleRuntime'

/**
 * Register APIs/tools/UI for every build-time enabled module and mark them
 * active. Registration failures are persisted as `failed` before re-throwing,
 * so a broken module never looks successfully activated.
 */
export default defineNitroPlugin(async () => {
  const resolved = resolveModules(MODULE_DEFINITIONS, resolveEnabledModuleIds())

  try {
    await registerEnabledModuleServices()
    for (const module of resolved.modules) {
      await recordModuleState(db, {
        moduleId: module.id,
        version: module.version,
        state: 'active',
        source: 'module-boot'
      }).catch(() => {})
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const module of resolved.modules) {
      await recordModuleState(db, {
        moduleId: module.id,
        version: module.version,
        state: 'failed',
        error: message,
        source: 'module-boot'
      }).catch(() => {})
    }
    throw error
  }
})
