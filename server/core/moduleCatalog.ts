import type { ModuleDefinition } from './moduleSdk'
import { exampleModule } from '../../modules/example/module'

/**
 * Build-time module catalog. Adding a module means adding it here (release
 * migrations + runtime services) AND whitelisting its layer in nuxt.config.ts.
 */
export const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [exampleModule]

/** Parse `ENABLED_MODULES` (space/comma separated); empty string disables all. */
export function parseEnabledModuleIds(value: string | undefined = process.env.ENABLED_MODULES): string[] {
  const ids = (value ?? 'example')
    .split(/[\s,]+/)
    .map(id => id.trim())
    .filter(Boolean)
  return [...new Set(ids)]
}
