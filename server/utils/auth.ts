import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { readSessionToken, setSessionCookie, clearSessionCookie } from './session'
import { createSessionToken, verifySessionToken, deleteSessionToken } from './tokens'
import { findUserById, findRoleById, type UserRow, type RoleRow } from './users'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { organizationMemberships, organizations } from '../database/schema'
import {
  ADMIN_ONLY_TABLES,
  authorize,
  permMatches,
  roleCanAccessTable,
  roleCanTableAction,
  roleHasDashboardAccess,
  type TableAction
} from '../core/permissions'

export {
  ADMIN_ONLY_TABLES,
  authorize,
  permMatches,
  roleCanAccessTable,
  roleCanTableAction,
  roleHasDashboardAccess
}
export type { TableAction }

export interface AuthContext {
  user: UserRow
  role: RoleRow | null
  organization?: { id: number, tenantId: number } | null
}

export async function getOrganizationContext(event: H3Event, userId: number): Promise<{ id: number, tenantId: number } | null> {
  const requestedId = event.context?.organizationId ?? event.context?.orgId ?? getHeader(event, 'x-organization-id')
  if (requestedId === undefined || requestedId === null || requestedId === '') return null
  const organizationId = Number(requestedId)
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid organization context' })
  }

  const [membership] = await db.select({ id: organizations.id, tenantId: organizations.tenantId })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(and(
      eq(organizationMemberships.userId, userId),
      eq(organizationMemberships.organizationId, organizationId),
      eq(organizationMemberships.status, 'active')
    ))
    .limit(1)
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'No active membership in the requested organization' })
  }
  return membership
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
  const organization = await getOrganizationContext(event, user.id)
  return { user, role, organization }
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

/**
 * Dashboard table access guard:
 * - Sensitive tables (ADMIN_ONLY_TABLES) are accessible only to admins;
 * - Other tables require login + the role's permissions to include the table (or '*');
 * - When `action` is provided, an extra table:action fine-grained check (read/create/update/delete) runs;
 * - When no table is passed (e.g. overview), the role must have at least one dashboard access right.
 */
export async function requireDashboardAccess(event: H3Event, table?: string, action?: TableAction): Promise<AuthContext> {
  const ctx = await requireUser(event)
  const decision = authorize(
    {
      userId: ctx.user.id,
      roleName: ctx.role?.name,
      permissions: ctx.role?.permissions,
      organizationId: ctx.organization?.id,
      tenantId: ctx.organization?.tenantId
    },
    { table: table ?? '', action }
  )
  if (decision.allowed) return ctx

  const message = decision.reason === 'admin-only'
    ? 'Admin privileges required for this table'
    : decision.reason === 'no-access'
      ? 'No dashboard access'
      : action ? `No '${action}' access to table: ${table}` : `No access to table: ${table}`
  throw createError({ statusCode: 403, statusMessage: 'Forbidden', message })
}
