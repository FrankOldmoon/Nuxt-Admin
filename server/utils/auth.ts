import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readSessionToken, setSessionCookie, clearSessionCookie } from './session'
import { createSessionToken, verifySessionToken, deleteSessionToken } from './tokens'
import { findUserById, findRoleById, type UserRow, type RoleRow } from './users'

export interface AuthContext {
  user: UserRow
  role: RoleRow | null
}

// Issue a new persisted token and set the cookie
export async function startSession(event: H3Event, userId: number): Promise<void> {
  const token = await createSessionToken(userId)
  setSessionCookie(event, token)
}

/**
 * Validate the user's session using the httpOnly `session` cookie
 * (tokens.type='session').  The final authorization (e.g. role.name==='admin')
 * is enforced one layer up by requireAdmin.
 */
export async function getSessionUser(event: H3Event): Promise<AuthContext | null> {
  const sessionTok = readSessionToken(event)
  if (!sessionTok) return null
  const userId = await verifySessionToken(sessionTok)
  if (!userId) return null
  const user = await findUserById(userId)
  if (!user || !user.isActive || user.deletedAt) return null
  const role = await findRoleById(user.roleId)
  return { user, role }
}

// Logout: delete token + clear cookie
export async function endSession(event: H3Event): Promise<void> {
  const token = readSessionToken(event)
  await deleteSessionToken(token)
  clearSessionCookie(event)
}

export async function requireUser(event: H3Event): Promise<AuthContext> {
  const ctx = await getSessionUser(event)
  if (!ctx) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Authentication required' })
  }
  return ctx
}

export async function requireAdmin(event: H3Event): Promise<AuthContext> {
  const ctx = await requireUser(event)
  if (ctx.role?.name !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Admin privileges required' })
  }
  return ctx
}

export function isAdmin(ctx: AuthContext): boolean {
  return ctx.role?.name === 'admin'
}

// --- Role-based dashboard table access (RBAC) ---

/** Sensitive tables accessible only to admins (users/roles/configs, etc.). */
export const ADMIN_ONLY_TABLES = new Set(['roles', 'users', 'files', 'configs'])

/** Fine-grained operations on dashboard tables: read=view/export, create=add/import, update=edit, delete=remove/batch */
export type TableAction = 'read' | 'create' | 'update' | 'delete'

/** Permission entry matching: '*' (all), 'table' (all actions on that table), 'table:action' (that single action). */
export function permMatches(perm: string, table: string, action?: TableAction): boolean {
  if (perm === '*') return true
  const idx = perm.indexOf(':')
  if (idx < 0) return perm === table          // bare table name -> all actions on that table
  const t = perm.slice(0, idx)
  const a = perm.slice(idx + 1) as string
  if (t !== table) return false
  if (action === undefined) return true        // no action specified -> table match is enough
  return a === action
}

export function roleHasDashboardAccess(permissions: string[] | null | undefined): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.includes('*') || permissions.length > 0
}

export function roleCanAccessTable(permissions: string[] | null | undefined, table: string): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.some(p => permMatches(p, table))
}

export function roleCanTableAction(permissions: string[] | null | undefined, table: string, action?: TableAction): boolean {
  if (!Array.isArray(permissions)) return false
  return permissions.some(p => permMatches(p, table, action))
}

/**
 * Dashboard table access guard:
 * - Sensitive tables (ADMIN_ONLY_TABLES) are accessible only to admins;
 * - Other tables require login + the role's permissions to include the table (or '*');
 * - When `action` is provided, an extra table:action fine-grained check (read/create/update/delete) runs;
 * - When no table is passed (e.g. overview), the role must have at least one dashboard access right.
 */
export async function requireDashboardAccess(event: H3Event, table?: string, action?: TableAction): Promise<AuthContext> {
  const ctx = await requireUser(event)
  if (!table) {
    if (!isAdmin(ctx) && !roleHasDashboardAccess(ctx.role?.permissions)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'No dashboard access' })
    }
    return ctx
  }
  if (ADMIN_ONLY_TABLES.has(table)) {
    if (!isAdmin(ctx)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Admin privileges required for this table' })
    }
    return ctx
  }
  if (!roleCanTableAction(ctx.role?.permissions, table, action)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: action ? `No '${action}' access to table: ${table}` : `No access to table: ${table}`
    })
  }
  return ctx
}
