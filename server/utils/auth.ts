import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { readSessionToken, setSessionCookie, clearSessionCookie } from './session'
import { createSessionToken, verifySessionToken, deleteSessionToken } from './tokens'
import { findUserById, findRoleById, type RoleRow } from './users'
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
import {
  effectiveRoleId,
  permissionsOf,
  type AuthContext,
  type OrganizationContext
} from '../core/authContext'
import { writeAudit } from '../core/audit'

export {
  ADMIN_ONLY_TABLES,
  authorize,
  permMatches,
  roleCanAccessTable,
  roleCanTableAction,
  roleHasDashboardAccess
}
export type { AuthContext, OrganizationContext, TableAction }

const MEMBERSHIP_SELECTION = {
  id: organizations.id,
  tenantId: organizations.tenantId,
  membershipId: organizationMemberships.id,
  roleId: organizationMemberships.roleId,
  departmentId: organizationMemberships.departmentId
}

async function findActiveMemberships(userId: number, limit: number): Promise<OrganizationContext[]> {
  return await db.select(MEMBERSHIP_SELECTION)
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(and(
      eq(organizationMemberships.userId, userId),
      eq(organizationMemberships.status, 'active')
    ))
    .orderBy(organizationMemberships.id)
    .limit(limit)
}

/**
 * Resolve the organization scope from server-validated memberships.
 * - An explicit organization ID (context/header) must match an active membership.
 * - Without one, a user with exactly one active membership is auto-scoped to it.
 * - Multiple memberships require an explicit selection; zero means no scope.
 */
export async function getOrganizationContext(event: H3Event, userId: number): Promise<OrganizationContext | null> {
  const requestedId = event.context?.organizationId ?? event.context?.orgId ?? getHeader(event, 'x-organization-id')
  if (requestedId === undefined || requestedId === null || requestedId === '') {
    const memberships = await findActiveMemberships(userId, 2)
    return memberships.length === 1 ? memberships[0]! : null
  }
  const organizationId = Number(requestedId)
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid organization context' })
  }

  const [membership] = await db.select(MEMBERSHIP_SELECTION)
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
  const organization = await getOrganizationContext(event, user.id)
  // Membership role is authoritative inside an organization; the user's global
  // role is only a fallback when no membership role is configured.
  const roleId = effectiveRoleId(user.roleId, organization?.roleId)
  const role = roleId === user.roleId ? await findRoleById(user.roleId) : await findRoleById(roleId)
  return {
    user,
    role,
    organization,
    tenantId: organization?.tenantId ?? null,
    membershipId: organization?.membershipId ?? null,
    departmentId: organization?.departmentId ?? null,
    permissions: permissionsOf(role)
  }
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

/** Canonical entry point for business modules. */
export async function getAuthContext(event: H3Event): Promise<AuthContext> {
  return await requireUser(event)
}

/** The current active organization, or 403 when the request has none. */
export async function getActiveOrganization(event: H3Event): Promise<OrganizationContext> {
  const ctx = await requireUser(event)
  if (!ctx.organization) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'An active organization is required' })
  }
  return ctx.organization
}

export function getEffectiveRole(ctx: AuthContext): RoleRow | null {
  return ctx.role
}

export function getEffectivePermissions(ctx: AuthContext): string[] {
  return ctx.permissions
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

  // Best-effort denied-access audit; never block the 403 response.
  await writeAudit(db, {
    actorUserId: ctx.user.id,
    tenantId: ctx.organization?.tenantId,
    organizationId: ctx.organization?.id,
    action: 'access.denied',
    resource: table ?? 'dashboard',
    after: { reason: decision.reason, action: action ?? null },
    outcome: 'failure',
    source: 'dashboard-rbac'
  }).catch(() => {})

  throw createError({ statusCode: 403, statusMessage: 'Forbidden', message })
}
