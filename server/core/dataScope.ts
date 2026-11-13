import { hasGlobalScope } from './authContext'

/** All supported row-level scopes. Any other value is rejected. */
export type DataScopeName = 'own' | 'assigned' | 'department' | 'organization' | 'tenant' | 'global'

const DATA_SCOPES = new Set<string>(['own', 'assigned', 'department', 'organization', 'tenant', 'global'])

/**
 * Per-table scope configuration. `scope` takes precedence over the legacy
 * role-level `dataScope` value (`all`/`self`).
 */
export interface DataScopeConfig {
  scope?: DataScopeName
  /** Optional custom resolver name registered by a business module. */
  resolver?: string
  /** Legacy: row owner column for `own` scope. */
  ownerColumn?: string
  /** Legacy: applies `own` scope to the users table itself (id = current user). */
  userTable?: boolean
  /** Column holding an explicitly assigned user. */
  assigneeColumn?: string
  departmentColumn?: string
  organizationColumn?: string
  tenantColumn?: string
}

export interface DataScopeActor {
  userId: number
  roleName?: string | null
  /** Legacy role-level value: `all` / `self` (or a scope name). */
  dataScope?: string | null
  permissions?: readonly string[] | null
  organizationId?: number | null
  tenantId?: number | null
  departmentId?: number | null
}

export type DataScopeDenialReason = 'global-permission' | 'missing-column' | 'missing-context' | 'unsupported-scope' | 'unknown-resolver'

export interface DataScopeGlobal {
  allowed: true
  scope: 'global'
}

export interface DataScopeConditional {
  allowed: true
  scope: Exclude<DataScopeName, 'global'>
  column: string
  value: string | number
  /** When present, the condition is `column IN (...)` instead of `column = value`. */
  values?: Array<string | number>
}

export interface DataScopeDenied {
  allowed: false
  reason: DataScopeDenialReason
}

export type DataScopeResolution = DataScopeGlobal | DataScopeConditional | DataScopeDenied

function legacyToScope(value: string | null | undefined): DataScopeName | null {
  if (!value || value === 'all') return 'global'
  if (value === 'self') return 'own'
  return DATA_SCOPES.has(value) ? value as DataScopeName : null
}

/**
 * Resolve the row-level condition for one resource.
 *
 * Security rules:
 * - `global` always requires an explicit `*` or `global` permission.
 * - Missing context or missing column mapping denies (never skips isolation).
 * - Unknown scope values deny.
 */
export function resolveDataScope(config: DataScopeConfig | undefined, actor: DataScopeActor): DataScopeResolution {
  const scope = config?.scope ?? legacyToScope(actor.dataScope)
  if (!scope) return { allowed: false, reason: 'unsupported-scope' }

  if (scope === 'global') {
    return hasGlobalScope(actor.permissions)
      ? { allowed: true, scope: 'global' }
      : { allowed: false, reason: 'global-permission' }
  }

  if (scope === 'own') {
    if (config?.userTable) return { allowed: true, scope: 'own', column: 'id', value: actor.userId }
    if (!config?.ownerColumn) return { allowed: false, reason: 'missing-column' }
    return { allowed: true, scope: 'own', column: config.ownerColumn, value: actor.userId }
  }

  if (scope === 'assigned') {
    if (!config?.assigneeColumn) return { allowed: false, reason: 'missing-column' }
    return { allowed: true, scope: 'assigned', column: config.assigneeColumn, value: actor.userId }
  }

  if (scope === 'department') {
    if (!config?.departmentColumn) return { allowed: false, reason: 'missing-column' }
    if (!actor.departmentId) return { allowed: false, reason: 'missing-context' }
    return { allowed: true, scope: 'department', column: config.departmentColumn, value: actor.departmentId }
  }

  if (scope === 'organization') {
    if (!config?.organizationColumn) return { allowed: false, reason: 'missing-column' }
    if (!actor.organizationId) return { allowed: false, reason: 'missing-context' }
    return { allowed: true, scope: 'organization', column: config.organizationColumn, value: actor.organizationId }
  }

  if (!config?.tenantColumn) return { allowed: false, reason: 'missing-column' }
  if (!actor.tenantId) return { allowed: false, reason: 'missing-context' }
  return { allowed: true, scope: 'tenant', column: config.tenantColumn, value: actor.tenantId }
}

export interface DataScopeResource {
  table: string
  action?: string
}

export interface DataScopeResolverInput {
  actor: DataScopeActor
  config: DataScopeConfig | undefined
  resource: DataScopeResource
}

/** Business modules can replace the default mapping with domain-specific logic. */
export type DataScopeResolver = (input: DataScopeResolverInput) => DataScopeResolution | Promise<DataScopeResolution>

const RESOLVERS = new Map<string, DataScopeResolver>()

export function registerDataScopeResolver(name: string, resolver: DataScopeResolver): void {
  const id = name.trim()
  if (!id) throw new TypeError('Data scope resolver name must not be empty')
  if (RESOLVERS.has(id)) throw new Error(`Duplicate data scope resolver: ${id}`)
  RESOLVERS.set(id, resolver)
}

/** Test/bootstrap hook; production registrations are expected to be additive. */
export function clearDataScopeResolvers(): void {
  RESOLVERS.clear()
}

/**
 * Resolve a table's scope, honouring an optional module-provided resolver.
 * Unknown resolver names deny instead of falling back to unrestricted access.
 */
export function resolveTableDataScope(
  config: DataScopeConfig | undefined,
  actor: DataScopeActor,
  resource: DataScopeResource
): DataScopeResolution | Promise<DataScopeResolution> {
  if (config?.resolver) {
    const resolver = RESOLVERS.get(config.resolver)
    if (!resolver) return { allowed: false, reason: 'unknown-resolver' }
    return resolver({ actor, config, resource })
  }
  return resolveDataScope(config, actor)
}

/** Check a single already-loaded record against a resolved scope. */
export function recordMatchesScope(
  resolution: DataScopeResolution,
  record: Record<string, unknown>
): boolean {
  if (!resolution.allowed) return false
  if (resolution.scope === 'global') return true
  if (resolution.values) return resolution.values.includes(record[resolution.column] as string | number)
  return record[resolution.column] === resolution.value
}

/** Drop records that fall outside the resolved scope. */
export function filterAccessibleRecords<T extends Record<string, unknown>>(
  records: readonly T[],
  resolution: DataScopeResolution
): T[] {
  if (!resolution.allowed) return []
  return records.filter(record => recordMatchesScope(resolution, record))
}

/** Human-readable denial for 403 responses. */
export function dataScopeDenialMessage(reason: DataScopeDenialReason): string {
  switch (reason) {
    case 'global-permission':
      return 'Global data scope requires an explicit global permission'
    case 'missing-column':
      return 'Resource has no column mapping for the required data scope'
    case 'missing-context':
      return 'The current request lacks the organization/tenant/department context required by this resource'
    case 'unknown-resolver':
      return 'The configured data scope resolver is not registered'
    default:
      return 'Unsupported data scope'
  }
}
