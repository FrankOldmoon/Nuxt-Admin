/**
 * Public Module SDK — the only contract business modules may depend on.
 *
 * Modules live in their own folders/repositories and must not import Core
 * implementation files (`server/core/**`, `server/utils/**`) directly. This
 * entry point re-exports the versioned contracts they need:
 *
 * - Manifest / definition / lifecycle / migration types and validators
 * - API, Tool and UI registries
 * - Permission primitives (`permMatches`, `authorize`, action types)
 * - DataScope contracts (`registerDataScopeResolver`, resolution types)
 * - Audit contract (`writeAudit`, audit entry types)
 * - Generic CRUD registration (`registerDashboardTable`, `registerTableValidator`)
 *   and the metadata types modules use to declare their tables
 *
 * `MODULE_API_VERSION` in `server/core/moduleManifest.ts` governs breaking
 * changes to this surface: bump it and require a matching `apiVersion` in every
 * module manifest when a contract changes incompatibly.
 */
export * from '../core/moduleSdk'
export { validateModuleManifests, CORE_VERSION, MODULE_API_VERSION } from '../core/moduleManifest'
export {
  ADMIN_ONLY_TABLES,
  authorize,
  permMatches,
  roleCanAccessTable,
  roleCanTableAction,
  roleHasDashboardAccess
} from '../core/permissions'
export type {
  PermissionContext,
  PermissionDecision,
  ResourceRef,
  TableAction
} from '../core/permissions'
export * from '../core/dataScope'
export * from '../core/audit'
export { registerDashboardTable } from '../utils/dashboard/tables'
export { registerTableValidator } from '../utils/dashboard/tableValidators'
export type { TableValidationContext, TableValidator } from '../utils/dashboard/tableValidators'
export type { FieldMeta, TableFeatures, TableMeta } from '../../app/types/dashboard'
