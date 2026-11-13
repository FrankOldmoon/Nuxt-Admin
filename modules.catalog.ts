import type { ModuleDefinition } from './server/core/moduleSdk'
import { parseEnabledModuleIds } from './server/core/moduleCatalog'
import { exampleModule } from './modules/example/module'
import { sisDemoModule } from './modules/sis-demo/module'

/**
 * Static module catalog. This is the ONLY file that knows which business
 * modules exist; Core consumes it without importing any specific module.
 * Adding a module means adding one import + one entry here (and enabling its
 * Nuxt layer in `nuxt.config.ts`, which derives from this list).
 *
 * It lives at the repository root (not under `modules/`) because Nuxt treats
 * top-level files in `modules/` as local Nuxt modules.
 */
export const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  exampleModule,
  sisDemoModule
]

/** Module IDs that can be enabled at build time. */
export const AVAILABLE_MODULE_IDS: readonly string[] = MODULE_DEFINITIONS.map(module => module.id)

/** Modules enabled when `ENABLED_MODULES` is not set. */
export const DEFAULT_ENABLED_MODULE_IDS: readonly string[] = ['example', 'sis-demo']

/** Resolve `ENABLED_MODULES` with the catalog's default. */
export function resolveEnabledModuleIds(value: string | undefined = process.env.ENABLED_MODULES): string[] {
  return parseEnabledModuleIds(value ?? DEFAULT_ENABLED_MODULE_IDS.join(','))
}
