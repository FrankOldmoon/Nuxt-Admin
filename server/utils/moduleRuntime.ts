import { ModuleApiRouter, ToolRegistry, UiRegistry, resolveModules } from '../core/moduleSdk'
import { MODULE_DEFINITIONS, parseEnabledModuleIds } from '../core/moduleCatalog'
import type { ModuleActor } from '../../modules/example/server/context'
import { registerExampleModule } from '../../modules/example/register'

/**
 * Runtime module services. Only modules enabled at build time are registered,
 * so a disabled module exposes no API/tool/UI IDs at all.
 */
export const moduleApiRouter = new ModuleApiRouter<ModuleActor>()
export const moduleTools = new ToolRegistry<ModuleActor>()
export const moduleUi = new UiRegistry<unknown, unknown>()

let registered = false

export function registerEnabledModuleServices(): void {
  if (registered) return
  registered = true

  const resolved = resolveModules(MODULE_DEFINITIONS, parseEnabledModuleIds())
  if (resolved.enabledIds.includes('example')) {
    registerExampleModule({ api: moduleApiRouter, tools: moduleTools, ui: moduleUi })
  }
}
