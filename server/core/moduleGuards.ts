import type { ModuleManifest } from './moduleSdk'

/**
 * Modules that declare `moduleId` as a dependency and are currently active.
 * Used to block uninstalling a module while a dependent module still relies on
 * it. Pure helper so the guard can be unit-tested without a database.
 */
export function activeDependents<T extends ModuleManifest>(
  modules: readonly T[],
  moduleId: string,
  stateOf: (id: string) => string | null | undefined
): string[] {
  return modules
    .filter(module => module.id !== moduleId && module.dependencies.includes(moduleId))
    .filter(module => stateOf(module.id) === 'active')
    .map(module => module.id)
    .sort()
}

/** States in which a module must not serve runtime API/tool traffic. */
export const UNAVAILABLE_MODULE_STATES = new Set(['deactivated', 'uninstalling', 'uninstalled'])

export function isModuleStateUnavailable(state: string | null | undefined): boolean {
  return !!state && UNAVAILABLE_MODULE_STATES.has(state)
}
