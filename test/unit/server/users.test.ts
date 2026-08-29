import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashPassword, verifyPassword } from '../../../server/utils/password'
import {
  checkPassword,
  toPublicUser,
  findUserById,
  findUserByUsernameOrEmail,
  findUserByEmail,
  findUserByUsername,
  findRoleById,
  findRoleByName,
  createUser,
  updateUserPassword,
  updateUserProfile,
  markEmailVerified,
  markEmailUnverified,
  updateLastLogin,
  listAllUsers,
  listUsersPaged,
  deleteUserById,
  softDeleteUsers,
  restoreUsers,
  permanentDeleteUsers,
  setUserActive,
  setUserRole
} from '../../../server/utils/users'

const db = vi.hoisted(() => {
  // build an awaitable drizzle chain mock: any method call returns itself, awaiting resolves to final
  const buildChain = (final: unknown) => {
    const chain: any = new Proxy(function () {}, {
      get: (_t, prop) => prop === 'then'
        ? (res: (v: unknown) => void) => Promise.resolve(final).then(res)
        : () => chain,
      apply: () => chain
    })
    return chain
  }
  return {
    buildChain,
    select: vi.fn(() => buildChain([])),
    insert: vi.fn(() => buildChain([])),
    update: vi.fn(() => buildChain([])),
    delete: vi.fn(() => buildChain([]))
  }
})

vi.mock('../../../server/utils/db', () => ({
  db,
  schema: {},
  pool: {}
}))

/** Set a top-level db method to return results in call order */
function setResults(method: 'select' | 'insert' | 'update' | 'delete', results: unknown[]) {
  db[method].mockReset().mockImplementation(() => db.buildChain(results.shift()))
}

/** Reset all db method call records; awaiting resolves to an empty array by default */
function resetDb() {
  for (const m of ['select', 'insert', 'update', 'delete'] as const) {
    db[m].mockReset().mockImplementation(() => db.buildChain([]))
  }
}

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 5,
  username: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
  telephone: '123456',
  avatarPath: null,
  passwordHash: 'salt:hash',
  isActive: true,
  roleId: 2,
  emailVerifiedAt: null,
  gender: null,
  birthday: null,
  lastLoginAt: null,
  lastLoginIp: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over
})

const roleRow = { id: 2, name: 'user', description: 'Standard' }

describe('checkPassword', () => {
  it('correct password passes verification', () => {
    const stored = hashPassword('SuperSecret1')
    expect(verifyPassword('SuperSecret1', stored)).toBe(true)
    expect(checkPassword('SuperSecret1', stored)).toBe(true)
  })

  it('wrong password fails verification', () => {
    const stored = hashPassword('SuperSecret1')
    expect(checkPassword('WrongPass9', stored)).toBe(false)
  })

  it('empty/malformed stored strings return false', () => {
    expect(verifyPassword('x', 'malformed')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
  })
})

describe('toPublicUser', () => {
  const baseUser = {
    id: 1,
    username: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    telephone: '123456',
    avatarPath: '/a.png',
    passwordHash: 'salt:hash',
    isActive: true,
    roleId: 2,
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    gender: 'female',
    birthday: '1990-01-01',
    lastLoginAt: null,
    lastLoginIp: '127.0.0.1',
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z')
  }

  it('strips sensitive fields and maps all fields', () => {
    const pub = toPublicUser(baseUser, { id: 2, name: 'user', description: 'Standard' })
    expect(pub).not.toHaveProperty('passwordHash')
    expect(pub.roleId).toBe(2)
    expect(pub.username).toBe('alice')
    expect(pub.email).toBe('alice@example.com')
    expect(pub.role).toEqual({ id: 2, name: 'user', description: 'Standard' })
    expect(pub.gender).toBe('female')
    expect(pub.birthday).toBe('1990-01-01')
    expect(pub.emailVerifiedAt).toEqual(baseUser.emailVerifiedAt)
  })

  it('role is null when there is no role', () => {
    const pub = toPublicUser(baseUser, null)
    expect(pub.role).toBeNull()
  })
})

describe('findUserById', () => {
  beforeEach(() => setResults('select', [[]]))

  it('returns the user row on a hit', async () => {
    setResults('select', [[userRow()]])
    expect(await findUserById(5)).toMatchObject({ id: 5, username: 'alice' })
  })

  it('returns null on a miss', async () => {
    expect(await findUserById(999)).toBeNull()
  })
})

describe('findUserByUsernameOrEmail', () => {
  beforeEach(() => resetDb())

  it('returns the user row matched by username or email', async () => {
    setResults('select', [[userRow()], [userRow({ email: 'alice@example.com' })]])
    expect(await findUserByUsernameOrEmail('alice')).toMatchObject({ id: 5 })
    expect(await findUserByUsernameOrEmail('alice@example.com')).toMatchObject({ id: 5 })
  })

  it('returns null on a miss', async () => {
    setResults('select', [[]])
    expect(await findUserByUsernameOrEmail('nobody')).toBeNull()
  })
})

describe('findUserByEmail / findUserByUsername', () => {
  beforeEach(() => resetDb())

  it('findUserByEmail returns the row on a hit and null on a miss', async () => {
    setResults('select', [[userRow()], []])
    expect(await findUserByEmail('alice@example.com')).toMatchObject({ id: 5 })
    expect(await findUserByEmail('nobody@example.com')).toBeNull()
  })

  it('findUserByUsername returns the row on a hit and null on a miss', async () => {
    setResults('select', [[userRow()], []])
    expect(await findUserByUsername('alice')).toMatchObject({ id: 5 })
    expect(await findUserByUsername('nobody')).toBeNull()
  })
})

describe('findRoleById / findRoleByName', () => {
  beforeEach(() => resetDb())

  it('findRoleById returns the row on a hit and null on a miss', async () => {
    setResults('select', [[roleRow], []])
    expect(await findRoleById(2)).toMatchObject({ name: 'user' })
    expect(await findRoleById(999)).toBeNull()
  })

  it('findRoleByName returns the row on a hit and null on a miss', async () => {
    setResults('select', [[roleRow], []])
    expect(await findRoleByName('user')).toMatchObject({ id: 2 })
    expect(await findRoleByName('ghost')).toBeNull()
  })
})

describe('createUser', () => {
  beforeEach(() => resetDb())

  it('creates a new row and its password hash is verifiable via checkPassword', async () => {
    const inserted = userRow({ id: 7, username: 'bob', email: 'bob@example.com', passwordHash: hashPassword('Passw0rd') })
    setResults('insert', [[inserted]])
    const row = await createUser({ username: 'bob', email: 'bob@example.com', password: 'Passw0rd', roleId: 2 })
    expect(row).toMatchObject({ id: 7, username: 'bob', roleId: 2 })
    expect(checkPassword('Passw0rd', row.passwordHash)).toBe(true)
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it('throws when insert returns no row', async () => {
    setResults('insert', [[]])
    await expect(createUser({ username: 'bob', email: 'b@x.com', password: 'Passw0rd', roleId: 2 }))
      .rejects.toThrow('Failed to create user')
  })
})

describe('updateUserPassword', () => {
  beforeEach(() => resetDb())

  it('calls update and completes normally', async () => {
    setResults('update', [[]])
    await expect(updateUserPassword(5, 'NewPass123')).resolves.toBeUndefined()
    expect(db.update).toHaveBeenCalledTimes(1)
  })
})

describe('updateUserProfile', () => {
  beforeEach(() => resetDb())

  it('returns the updated row when fields change', async () => {
    setResults('update', [[userRow({ name: 'NewName' })]])
    const row = await updateUserProfile(5, { name: 'NewName' })
    expect(row).toMatchObject({ id: 5, name: 'NewName' })
    expect(db.update).toHaveBeenCalledTimes(1)
  })

  it('skips update for empty input and re-reads the current row', async () => {
    setResults('select', [[userRow()]])
    const row = await updateUserProfile(5, {})
    expect(row).toMatchObject({ id: 5 })
    expect(db.update).not.toHaveBeenCalled()
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  it('returns null when the update matches no row', async () => {
    setResults('update', [[]])
    expect(await updateUserProfile(999, { name: 'x' })).toBeNull()
  })
})

describe('markEmailVerified / markEmailUnverified', () => {
  beforeEach(() => resetDb())

  it('returns the updated row on verification, null on a miss', async () => {
    setResults('update', [[userRow({ emailVerifiedAt: new Date() })], []])
    expect(await markEmailVerified(5)).toMatchObject({ id: 5 })
    expect(await markEmailVerified(999)).toBeNull()
  })

  it('returns the updated row when un-verifying', async () => {
    setResults('update', [[userRow()]])
    expect(await markEmailUnverified(5)).toMatchObject({ id: 5 })
  })
})

describe('updateLastLogin', () => {
  beforeEach(() => resetDb())

  it('calls update and completes normally', async () => {
    setResults('update', [[]])
    await expect(updateLastLogin(5, '127.0.0.1')).resolves.toBeUndefined()
    expect(db.update).toHaveBeenCalledTimes(1)
  })
})

describe('listAllUsers', () => {
  beforeEach(() => resetDb())

  it('returns all user rows', async () => {
    setResults('select', [[userRow(), userRow({ id: 6, username: 'bob' })]])
    const rows = await listAllUsers()
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ id: 6, username: 'bob' })
  })
})

describe('listUsersPaged', () => {
  beforeEach(() => resetDb())

  it('returns paged rows and the total', async () => {
    const rows = [userRow(), userRow({ id: 6 })]
    setResults('select', [rows, [{ value: 42 }]])
    const page = await listUsersPaged(10, 20)
    expect(page.rows).toHaveLength(2)
    expect(page.total).toBe(42)
    expect(db.select).toHaveBeenCalledTimes(2)
  })

  it('trash mode also returns rows and the total', async () => {
    const trashed = [userRow({ deletedAt: new Date() })]
    setResults('select', [trashed, [{ value: 1 }]])
    const page = await listUsersPaged(0, 20, true)
    expect(page.total).toBe(1)
    expect(page.rows[0]?.deletedAt).toBeInstanceOf(Date)
  })
})

describe('deleteUserById', () => {
  beforeEach(() => resetDb())

  it('deletes successfully and returns true', async () => {
    setResults('delete', [[{ id: 5 }]])
    expect(await deleteUserById(5)).toBe(true)
  })

  it('returns false when the target does not exist', async () => {
    setResults('delete', [[]])
    expect(await deleteUserById(999)).toBe(false)
  })
})

describe('softDeleteUsers', () => {
  beforeEach(() => resetDb())

  it('returns 0 for an empty array without touching the database', async () => {
    expect(await softDeleteUsers([])).toBe(0)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('returns the number of soft-deleted rows', async () => {
    setResults('update', [[{ id: 5 }, { id: 6 }]])
    expect(await softDeleteUsers([5, 6])).toBe(2)
    expect(db.update).toHaveBeenCalledTimes(1)
  })
})

describe('restoreUsers', () => {
  beforeEach(() => resetDb())

  it('returns 0 for an empty array without touching the database', async () => {
    expect(await restoreUsers([])).toBe(0)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('returns the number of restored rows', async () => {
    setResults('update', [[{ id: 5 }]])
    expect(await restoreUsers([5])).toBe(1)
  })
})

describe('permanentDeleteUsers', () => {
  beforeEach(() => resetDb())

  it('returns 0 for an empty array without touching the database', async () => {
    expect(await permanentDeleteUsers([])).toBe(0)
    expect(db.delete).not.toHaveBeenCalled()
  })

  it('returns the number of permanently deleted rows', async () => {
    setResults('delete', [[{ id: 5 }, { id: 6 }, { id: 7 }]])
    expect(await permanentDeleteUsers([5, 6, 7])).toBe(3)
  })
})

describe('setUserActive', () => {
  beforeEach(() => resetDb())

  it('returns the updated row', async () => {
    setResults('update', [[userRow({ isActive: false })]])
    expect(await setUserActive(5, false)).toMatchObject({ isActive: false })
  })

  it('returns null on a miss', async () => {
    setResults('update', [[]])
    expect(await setUserActive(999, true)).toBeNull()
  })
})

describe('setUserRole', () => {
  beforeEach(() => resetDb())

  it('returns the updated row', async () => {
    setResults('update', [[userRow({ roleId: 1 })]])
    expect(await setUserRole(5, 1)).toMatchObject({ roleId: 1 })
    expect(db.update).toHaveBeenCalledTimes(1)
  })

  it('returns null on a miss', async () => {
    setResults('update', [[]])
    expect(await setUserRole(999, 1)).toBeNull()
  })
})