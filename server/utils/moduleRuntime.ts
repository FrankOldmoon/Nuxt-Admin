import { ModuleApiRouter, ToolRegistry, UiRegistry, resolveModules } from '../core/moduleSdk'
import { MODULE_DEFINITIONS, resolveEnabledModuleIds } from '../../modules.catalog'

/** Minimal actor shape; each module narrows it in its own definitions. */
export interface ModuleRuntimeActor {
  userId: number
  roleName?: string | null
  permissions?: readonly string[] | null
  organizationId?: number | null
  tenantId?: number | null
}

/**
 * Runtime module services. Only modules enabled at build time are registered,
 * so a disabled module exposes no API/tool/UI IDs at all. Business modules
 * self-register through `ModuleDefinition.register`; Core holds no module IDs.
 */
export const moduleApiRouter = new ModuleApiRouter<ModuleRuntimeActor>()
export const moduleTools = new ToolRegistry<ModuleRuntimeActor>()
export const moduleUi = new UiRegistry<unknown, unknown>()

let registered = false

export async function registerEnabledModuleServices(): Promise<void> {
  if (registered) return
  registered = true

  const resolved = resolveModules(MODULE_DEFINITIONS, resolveEnabledModuleIds())
  for (const module of resolved.modules) {
    await module.register?.({
      moduleId: module.id,
      api: moduleApiRouter as unknown as ModuleApiRouter<unknown>,
      tools: moduleTools as unknown as ToolRegistry<unknown>,
      ui: moduleUi
    })
  }
}
