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
  return {
    readSessionToken, setSessionCookie, clearSessionCookie,
    createSessionToken, verifySessionToken, deleteSessionToken,
    findUserById, findRoleById, getHeader, getCookie, createError
  }
})

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

import { startSession, getSessionUser, endSession, requireUser, requireAdmin, isAdmin } from '../../../server/utils/auth'

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
    expect(isAdmin({ user: activeUser, role: adminRole })).toBe(true)
    expect(isAdmin({ user: activeUser, role: userRole })).toBe(false)
    expect(isAdmin({ user: activeUser, role: null })).toBe(false)
  })
})