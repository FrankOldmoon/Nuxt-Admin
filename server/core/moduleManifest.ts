import type { ModuleManifest } from './moduleSdk'
import { satisfiesVersionRange } from './moduleSdk'

/** Core version used for manifest compatibility ranges. */
export const CORE_VERSION = '1.0.0'
/** Supported module API contract version. */
export const MODULE_API_VERSION = '1'

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const MODULE_ID = /^[a-z][a-z0-9-]*$/
const PERMISSION = /^[a-z0-9][a-z0-9.:_-]*$/

/**
 * Validate module migration metadata before activation: IDs are non-empty,
 * globally unique, and every migration declares an author-managed checksum
 * revision (used to detect edits to already-applied migrations).
 */
export function validateModuleMigrationMetadata(
  modules: ReadonlyArray<{ id: string, migrations?: ReadonlyArray<{ id: string, checksum?: string }> }>
): void {
  const ids = new Set<string>()
  for (const module of modules) {
    for (const migration of module.migrations ?? []) {
      if (!migration.id.trim()) {
        throw new Error(`Module ${module.id} has a migration with an empty ID`)
      }
      if (ids.has(migration.id)) {
        throw new Error(`Duplicate module migration ID: ${migration.id}`)
      }
      ids.add(migration.id)
      if (!migration.checksum?.trim()) {
        throw new Error(`Module migration ${migration.id} must declare a checksum revision`)
      }
    }
  }
}

export function validateModuleManifests(modules: readonly ModuleManifest[]): void {
  const ids = new Set<string>()
  for (const module of modules) {
    if (!MODULE_ID.test(module.id)) {
      throw new Error(`Invalid module ID: ${module.id}`)
    }
    if (ids.has(module.id)) throw new Error(`Duplicate module ID: ${module.id}`)
    ids.add(module.id)

    if (!SEMVER.test(module.version)) {
      throw new Error(`Module ${module.id} has an invalid semantic version: ${module.version}`)
    }

    const apiVersion = module.apiVersion ?? MODULE_API_VERSION
    if (apiVersion !== MODULE_API_VERSION) {
      throw new Error(`Module ${module.id} requires unsupported API version: ${apiVersion}`)
    }

    const coreRange = module.compatibility?.core
    if (coreRange && !satisfiesVersionRange(CORE_VERSION, coreRange)) {
      throw new Error(`Module ${module.id} is incompatible with core ${CORE_VERSION} (requires ${coreRange})`)
    }

    const permissions = new Set<string>()
    for (const permission of module.permissions) {
      if (permission === '*') {
        throw new Error(`Module ${module.id} must not declare the wildcard permission`)
      }
      if (!PERMISSION.test(permission)) {
        throw new Error(`Module ${module.id} has an invalid permission: ${permission}`)
      }
      if (permissions.has(permission)) {
        throw new Error(`Module ${module.id} declares duplicate permission: ${permission}`)
      }
      permissions.add(permission)
    }

    const navigationIds = new Set<string>()
    for (const item of module.navigation) {
      if (!item.id || !item.label || !item.to) {
        throw new Error(`Module ${module.id} has an invalid navigation entry`)
      }
      if (navigationIds.has(item.id)) {
        throw new Error(`Module ${module.id} has duplicate navigation id: ${item.id}`)
      }
      navigationIds.add(item.id)
    }

    for (const [capability, enabled] of Object.entries(module.capabilities ?? {})) {
      if (typeof enabled !== 'boolean') {
        throw new Error(`Module ${module.id} capability ${capability} must be a boolean`)
      }
    }

    if (module.migrationScope && module.migrationScope !== 'global' && module.migrationScope !== 'tenant') {
      throw new Error(`Module ${module.id} has an invalid migration scope: ${module.migrationScope}`)
    }
  }
}
