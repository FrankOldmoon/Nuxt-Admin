import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const readSessionToken = vi.fn()
  const setSessionCookie = vi.fn()
  const clearSessionCookie = vi.fn()
  const createSessionToken = vi.fn()
  const verifySessionToken = vi.fn()
  const deleteSessionToken = vi.fn()
  const findUserById = vi.fn()
  const findRoleById = vi.fn()
  const getHeader = vi.fn(() => undefined)
  const getCookie = vi.fn(() => undefined)
  const createError = vi.fn((opts: any) => {
    const e: any = new Error(opts?.message || opts?.statusMessage || 'error')
    e.statusCode = opts?.statusCode
    e.statusMessage = opts?.statusMessage
    return e
  })
  const dbSelect = vi.fn()
  return {
    readSessionToken, setSessionCookie, clearSessionCookie,
    createSessionToken, verifySessionToken, deleteSessionToken,
    findUserById, findRoleById, getHeader, getCookie, createError,
    dbSelect
  }
})

vi.mock('../../../server/utils/db', () => ({
  db: { select: h.dbSelect }
}))

vi.mock('h3', () => ({
  createError: h.createError,
  getHeader: h.getHeader,
  getCookie: h.getCookie
}))
vi.mock('../../../server/utils/session', () => ({
  readSessionToken: h.readSessionToken,
  setSessionCookie: h.setSessionCookie,
  clearSessionCookie: h.clearSessionCookie
}))
vi.mock('../../../server/utils/tokens', () => ({
  createSessionToken: h.createSessionToken,
  verifySessionToken: h.verifySessionToken,
  deleteSessionToken: h.deleteSessionToken
}))
vi.mock('../../../server/utils/users', () => ({
  findUserById: h.findUserById,
  findRoleById: h.findRoleById
}))

import {
  getActiveOrganization,
  getAuthContext,
  getEffectivePermissions,
  getEffectiveRole,
  getOrganizationContext,
  startSession,
  getSessionUser,
  endSession,
  requireUser,
  requireAdmin,
  isAdmin
} from '../../../server/utils/auth'

/** Mock the membership join chain used by organization resolution. */
function mockDbRows(rows: Array<Record<string, unknown>>) {
  const limit = vi.fn(async () => rows)
  const orderBy = vi.fn(() => ({ limit }))
  const where = vi.fn(() => ({ limit, orderBy }))
  const innerJoin = vi.fn(() => ({ where }))
  const from = vi.fn(() => ({ innerJoin }))
  h.dbSelect.mockReturnValue({ from })
}

beforeEach(() => {
  h.dbSelect.mockReset()
  mockDbRows([])
})

const activeUser = {
  id: 5, username: 'alice', email: 'a@x.com', passwordHash: 'h', roleId: 2,
  isActive: true, deletedAt: null, emailVerifiedAt: null, name: null, telephone: null,
  avatarPath: null, gender: null, birthday: null, lastLoginAt: null, lastLoginIp: null,
  createdAt: new Date(), updatedAt: new Date()
}
const adminRole = { id: 1, name: 'admin', description: null }
const userRole = { id: 2, name: 'user', description: null }

describe('startSession', () => {
  it('creates a token and writes the cookie', async () => {
    h.createSessionToken.mockResolvedValueOnce('tok')
    await startSession({} as never, 5)
    expect(h.createSessionToken).toHaveBeenCalledWith(5)
    expect(h.setSessionCookie).toHaveBeenCalledWith({}, 'tok')
  })
})

describe('getSessionUser', () => {
  beforeEach(() => {
    h.readSessionToken.mockReset()
    h.verifySessionToken.mockReset()
    h.findUserById.mockReset()
    h.findRoleById.mockReset()
    h.getHeader.mockClear()
    h.getCookie.mockClear()
  })

  it('returns null without a valid token', async () => {
    h.readSessionToken.mockReturnValue(undefined)
    h.verifySessionToken.mockResolvedValue(null)
    expect(await getSessionUser({} as never)).toBeNull()
  })

  it('returns the context for an active user', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockResolvedValue(adminRole)
    const ctx = await getSessionUser({} as never)
    expect(ctx?.user.id).toBe(5)
    expect(ctx?.role?.name).toBe('admin')
  })

  it('returns null for an inactive user', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue({ ...activeUser, isActive: false })
    expect(await getSessionUser({} as never)).toBeNull()
  })

  it('returns null for a deleted user', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue({ ...activeUser, deletedAt: new Date() })
    expect(await getSessionUser({} as never)).toBeNull()
  })
})

describe('endSession', () => {
  it('deletes the token and clears the cookie', async () => {
    h.readSessionToken.mockReturnValue('tok')
    await endSession({} as never)
    expect(h.deleteSessionToken).toHaveBeenCalledWith('tok')
    expect(h.clearSessionCookie).toHaveBeenCalled()
  })
})

describe('requireUser', () => {
  beforeEach(() => {
    h.readSessionToken.mockReset()
    h.verifySessionToken.mockReset()
    h.findUserById.mockReset()
    h.findRoleById.mockReset()
    h.getHeader.mockClear()
    h.getCookie.mockClear()
  })

  it('throws 401 when unauthenticated', async () => {
    h.readSessionToken.mockReturnValue(undefined)
    h.verifySessionToken.mockResolvedValue(null)
    await expect(requireUser({} as never)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns the context when authenticated', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockResolvedValue(userRole)
    await expect(requireUser({} as never)).resolves.toMatchObject({ user: activeUser })
  })
})

describe('requireAdmin', () => {
  beforeEach(() => {
    h.readSessionToken.mockReset()
    h.verifySessionToken.mockReset()
    h.findUserById.mockReset()
    h.findRoleById.mockReset()
    h.getHeader.mockClear()
    h.getCookie.mockClear()
  })

  it('throws 403 for non-admins', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockResolvedValue(userRole)
    await expect(requireAdmin({} as never)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets admins through', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockResolvedValue(adminRole)
    await expect(requireAdmin({} as never)).resolves.toMatchObject({ role: adminRole })
  })
})

describe('isAdmin', () => {
  it('detects whether the context is an admin', () => {
    expect(isAdmin({ user: activeUser, role: adminRole, permissions: [] })).toBe(true)
    expect(isAdmin({ user: activeUser, role: userRole, permissions: [] })).toBe(false)
    expect(isAdmin({ user: activeUser, role: null, permissions: [] })).toBe(false)
  })
})

describe('getOrganizationContext', () => {
  function mockMembership(rows: Array<Record<string, unknown>>) {
    mockDbRows(rows)
  }

  it('returns null when the user has no active membership', async () => {
    expect(await getOrganizationContext({ context: {} } as never, 5)).toBeNull()
    expect(h.dbSelect).toHaveBeenCalled()
  })

  it('rejects malformed organization IDs', async () => {
    await expect(getOrganizationContext({ context: { organizationId: 'abc' } } as never, 5))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(getOrganizationContext({ context: { organizationId: 0 } } as never, 5))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(h.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects when the user has no active membership', async () => {
    mockMembership([])
    await expect(getOrganizationContext({ context: { organizationId: 3 } } as never, 5))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('resolves the tenant and membership role for an active membership', async () => {
    mockMembership([{ id: 3, tenantId: 9, membershipId: 11, roleId: null, departmentId: null }])
    await expect(getOrganizationContext({ context: { organizationId: 3 } } as never, 5))
      .resolves.toEqual({ id: 3, tenantId: 9, membershipId: 11, roleId: null, departmentId: null })
  })

  it('auto-selects the only active membership', async () => {
    mockMembership([{ id: 3, tenantId: 9, membershipId: 11, roleId: 2, departmentId: 4 }])
    await expect(getOrganizationContext({ context: {} } as never, 5))
      .resolves.toEqual({ id: 3, tenantId: 9, membershipId: 11, roleId: 2, departmentId: 4 })
  })

  it('does not guess when the user has multiple memberships', async () => {
    mockMembership([
      { id: 3, tenantId: 9, membershipId: 11, roleId: 2, departmentId: null },
      { id: 4, tenantId: 9, membershipId: 12, roleId: 3, departmentId: null }
    ])
    await expect(getOrganizationContext({ context: {} } as never, 5)).resolves.toBeNull()
  })

  it('includes the resolved organization and effective permissions in getSessionUser', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockResolvedValue({ ...userRole, permissions: ['posts:read'] })
    mockMembership([{ id: 3, tenantId: 9, membershipId: 11, roleId: 2, departmentId: 4 }])

    const ctx = await getSessionUser({ context: { organizationId: 3 } } as never)
    expect(ctx?.organization).toEqual({ id: 3, tenantId: 9, membershipId: 11, roleId: 2, departmentId: 4 })
    expect(ctx?.membershipId).toBe(11)
    expect(ctx?.departmentId).toBe(4)
    expect(ctx?.permissions).toEqual(['posts:read'])
  })

  it('re-resolves the effective role when the organization switches', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockImplementation(async (id: number) => (id === 1
      ? { ...adminRole, permissions: ['*'] }
      : { ...userRole, permissions: ['posts:read'] }))

    mockMembership([{ id: 3, tenantId: 9, membershipId: 11, roleId: 1, departmentId: null }])
    const first = await getSessionUser({ context: { organizationId: 3 } } as never)

    mockMembership([{ id: 4, tenantId: 9, membershipId: 12, roleId: 2, departmentId: null }])
    const second = await getSessionUser({ context: { organizationId: 4 } } as never)

    expect(first?.role?.name).toBe('admin')
    expect(first?.permissions).toEqual(['*'])
    expect(second?.role?.name).toBe('user')
    expect(second?.permissions).toEqual(['posts:read'])
    expect(second?.membershipId).toBe(12)
  })

  it('uses the membership role instead of the global role', async () => {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockImplementation(async (id: number) => (id === 2 ? userRole : { ...adminRole, permissions: ['*'] }))
    mockMembership([{ id: 3, tenantId: 9, membershipId: 11, roleId: 1, departmentId: null }])

    const ctx = await getSessionUser({ context: { organizationId: 3 } } as never)
    expect(ctx?.role?.name).toBe('admin')
    expect(ctx?.permissions).toEqual(['*'])
  })
})

describe('canonical auth services', () => {
  function session() {
    h.readSessionToken.mockReturnValue('tok')
    h.verifySessionToken.mockResolvedValue(5)
    h.findUserById.mockResolvedValue(activeUser)
    h.findRoleById.mockResolvedValue({ ...userRole, permissions: ['posts:read'] })
  }

  it('getActiveOrganization requires an active organization', async () => {
    session()
    mockDbRows([])
    await expect(getActiveOrganization({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns the organization and effective authorization helpers', async () => {
    session()
    mockDbRows([{ id: 3, tenantId: 9, membershipId: 11, roleId: 2, departmentId: 4 }])

    const ctx = await getAuthContext({ context: {} } as never)
    expect(ctx.organization?.id).toBe(3)
    expect(getEffectiveRole(ctx)?.name).toBe('user')
    expect(getEffectivePermissions(ctx)).toEqual(['posts:read'])
    await expect(getActiveOrganization({ context: {} } as never)).resolves.toMatchObject({ id: 3, membershipId: 11 })
  })
})