import type { ModuleDefinition } from './moduleSdk'

/**
 * Parse `ENABLED_MODULES` (space/comma separated), de-duplicated.
 * An empty string disables all modules; an undefined value yields `[]` so the
 * catalog (not Core) owns the default enable list.
 */
export function parseEnabledModuleIds(value: string | undefined): string[] {
  if (value === undefined) return []
  const ids = value
    .split(/[\s,]+/)
    .map(id => id.trim())
    .filter(Boolean)
  return [...new Set(ids)]
}

/** Validate configured IDs against the static catalog. */
export function validateEnabledIds(availableIds: readonly string[], enabledIds: readonly string[]): void {
  const available = new Set(availableIds)
  for (const id of enabledIds) {
    if (!available.has(id)) throw new Error(`Unknown enabled module: ${id}`)
  }
}

/** Convenience wrapper used by boot/migration entry points. */
export function checkEnabledModules<T extends ModuleDefinition>(
  definitions: readonly T[],
  enabledIds: readonly string[]
): void {
  validateEnabledIds(definitions.map(module => module.id), enabledIds)
}
