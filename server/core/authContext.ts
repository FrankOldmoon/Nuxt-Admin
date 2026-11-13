import type { RoleRow, UserRow } from '../utils/users'

/** Validated organization scope attached to a request. */
export interface OrganizationContext {
  id: number
  tenantId: number
  membershipId: number
  roleId: number | null
  departmentId: number | null
}

/**
 * Server-created authorization context. Clients can never supply permissions,
 * role names, tenant IDs or organization IDs as authorization evidence.
 */
export interface AuthContext {
  user: UserRow
  /** Role effective in the current organization (membership role first). */
  role: RoleRow | null
  organization?: OrganizationContext | null
  tenantId?: number | null
  membershipId?: number | null
  departmentId?: number | null
  /** Effective permissions of `role` (empty when no role). */
  permissions: string[]
}

/** Membership role wins over the legacy global `users.roleId`. */
export function effectiveRoleId(globalRoleId: number, membershipRoleId?: number | null): number {
  return membershipRoleId ?? globalRoleId
}

export function permissionsOf(role: { permissions?: unknown } | null | undefined): string[] {
  const value = role?.permissions
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * `global` data scope is never implied by being an admin: it requires an
 * explicit `*` or `global` permission entry.
 */
export function hasGlobalScope(permissions: readonly string[] | null | undefined): boolean {
  if (!permissions) return false
  return permissions.includes('*') || permissions.includes('global')
}
