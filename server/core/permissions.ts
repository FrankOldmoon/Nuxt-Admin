/**
 * Pure permission primitives shared by the HTTP guards and module code.
 * No database or h3 imports here, so module definitions and unit tests can
 * evaluate permissions without booting the server.
 */

/** Sensitive tables accessible only to admins (users/roles/configs, etc.). */
export const ADMIN_ONLY_TABLES = new Set([
  'roles',
  'users',
  'files',
  'configs',
  // Internal tables are normally unreachable through generic CRUD; keeping
  // them here is defense-in-depth if one is ever exposed by mistake.
  'tokens',
  'sessions',
  'auditLogs',
  'audit_logs',
  'tenants',
  'organizations',
  'organizationMemberships',
  'organization_memberships',
  'departments',
  'privateMessages',
  'private_messages',
  'oauthAccounts',
  'oauth_accounts',
  'oauthAuthorizationCodes',
  'oauth_authorization_codes',
  'oauthAccessTokens',
  'oauth_access_tokens',
  'oauthRefreshTokens',
  'oauth_refresh_tokens',
  'wxUsers',
  'wx_users',
  'wxSessions',
  'wx_sessions'
])

/** Fine-grained operations: read=view/export, create=add/import, update=edit, delete=remove/batch */
export type TableAction = 'read' | 'create' | 'update' | 'delete'

/** Identity + organization scope used for authorization decisions. */
export interface PermissionContext {
  userId: number
  roleName?: string | null
  permissions?: readonly string[] | null
  organizationId?: number | null
  tenantId?: number | null
}

export interface ResourceRef {
  /** Registered resource/table name. */
  table: string
  action?: TableAction
  /** Canonical resource permission per action (e.g. `sis.students.read`). */
  permissions?: Partial<Record<TableAction, string>>
}

export interface PermissionDecision {
  allowed: boolean
  reason: 'allowed' | 'admin-only' | 'action-denied' | 'no-access'
}

/** Permission entry matching: '*' (all), 'table' (all actions), 'table:action'. */
export function permMatches(perm: string, table: string, action?: TableAction): boolean {
  if (perm === '*') return true
  const idx = perm.indexOf(':')
  if (idx < 0) return perm === table // bare table name -> all actions on that table
  const t = perm.slice(0, idx)
  const a = perm.slice(idx + 1) as string
  if (t !== table) return false
  if (action === undefined) return true // no action specified -> table match is enough
  return a === action
}

export function roleHasDashboardAccess(permissions: string[] | readonly string[] | null | undefined): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.includes('*') || permissions.length > 0
}

export function roleCanAccessTable(permissions: string[] | readonly string[] | null | undefined, table: string): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.some(p => permMatches(p, table))
}

export function roleCanTableAction(
  permissions: string[] | readonly string[] | null | undefined,
  table: string,
  action?: TableAction
): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.some(p => permMatches(p, table, action))
}

/**
 * Single server-side decision point. Defaults to denying; callers turn a
 * negative decision into their transport-specific error (401/403).
 */
export function authorize(ctx: PermissionContext, resource: ResourceRef): PermissionDecision {
  const permissions = ctx.permissions ?? []
  const admin = ctx.roleName === 'admin'

  if (resource.table && ADMIN_ONLY_TABLES.has(resource.table) && !admin) {
    return { allowed: false, reason: 'admin-only' }
  }
  if (!resource.table) {
    return admin || roleHasDashboardAccess(permissions)
      ? { allowed: true, reason: 'allowed' }
      : { allowed: false, reason: 'no-access' }
  }
  const canonical = resource.action ? resource.permissions?.[resource.action] : undefined
  if (canonical && permissions.includes(canonical)) {
    return { allowed: true, reason: 'allowed' }
  }
  if (admin || roleCanTableAction(permissions, resource.table, resource.action)) {
    return { allowed: true, reason: 'allowed' }
  }
  return { allowed: false, reason: 'action-denied' }
}
