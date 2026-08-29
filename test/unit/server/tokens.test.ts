import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { buildChain } from '../../helpers/db'

const { insertRecords, db } = vi.hoisted(() => {
  const insertRecords: any[] = []
  const chain = (final: unknown) => new Proxy(function () {}, {
    get: (_t, prop) => prop === 'then'
      ? (res: (v: unknown) => void) => Promise.resolve(final).then(res)
      : () => chain(final),
    apply: () => chain(final)
  })
  const db = {
    select: vi.fn(() => chain([])),
    insert: vi.fn(() => ({
      values: (values: any) => {
        insertRecords.push(values)
        return chain([])
      }
    })),
    update: vi.fn(() => chain([])),
    delete: vi.fn(() => chain([]))
  }
  return { insertRecords, db }
})
vi.mock('../../../server/utils/db', () => ({ db, schema: {}, pool: {} }))
vi.mock('../../../server/utils/configs', () => ({
  getConfigValue: vi.fn(async () => 7)
}))

import {
  createSessionToken,
  verifySessionToken,
  deleteSessionToken,
  createTypedToken,
  verifyTypedToken,
  consumeTypedToken,
  purgeUserTypedTokens,
  purgeExpiredTokens
} from '../../../server/utils/tokens'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

describe('createSessionToken', () => {
  beforeEach(() => insertRecords.length = 0)

  it('generates a 64-char hex token and persists its hash', async () => {
    const token = await createSessionToken(5)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const record = insertRecords[0]
    expect(record.userId).toBe(5)
    expect(record.type).toBe('session')
    expect(record.tokenHash).toBe(sha256(token))
    expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('verifySessionToken', () => {
  it('returns null for an empty token', async () => {
    expect(await verifySessionToken(undefined)).toBeNull()
  })

  it('returns the userId when valid and not expired', async () => {
    db.select.mockImplementation(() => buildChain([{ userId: 5, expiresAt: new Date(Date.now() + 60_000) }]))
    expect(await verifySessionToken('some-token')).toBe(5)
  })

  it('returns null and deletes an expired token', async () => {
    db.select.mockImplementation(() => buildChain([{ userId: 5, expiresAt: new Date(Date.now() - 60_000) }]))
    expect(await verifySessionToken('expired-token')).toBeNull()
    expect(db.delete).toHaveBeenCalled()
  })

  it('returns null when not found', async () => {
    db.select.mockImplementation(() => buildChain([]))
    expect(await verifySessionToken('unknown')).toBeNull()
  })
})

describe('deleteSessionToken', () => {
  it('does not delete for an empty token', async () => {
    db.delete.mockClear()
    await deleteSessionToken(undefined)
    expect(db.delete).not.toHaveBeenCalled()
  })

  it('deletes when a token is provided', async () => {
    db.delete.mockClear()
    await deleteSessionToken('abc')
    expect(db.delete).toHaveBeenCalled()
  })
})

describe('createTypedToken', () => {
  beforeEach(() => insertRecords.length = 0)

  it('creates a typed token with an expiry', async () => {
    const { token, expiresAt } = await createTypedToken(9, 'password_reset', 30)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(insertRecords[0].type).toBe('password_reset')
    expect(insertRecords[0].userId).toBe(9)
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(0)
  })
})

describe('verifyTypedToken', () => {
  it('returns the userId when the type matches and is not expired', async () => {
    db.select.mockImplementation(() => buildChain([{ userId: 3, expiresAt: new Date(Date.now() + 60_000) }]))
    expect(await verifyTypedToken('tok', 'email_verify')).toBe(3)
  })
})

describe('consumeTypedToken', () => {
  it('calls delete', async () => {
    db.delete.mockClear()
    await consumeTypedToken('tok', 'password_reset')
    expect(db.delete).toHaveBeenCalled()
  })
})

describe('purgeUserTypedTokens', () => {
  it('deletes by user and type', async () => {
    db.delete.mockClear()
    await purgeUserTypedTokens(7, 'email_verify')
    expect(db.delete).toHaveBeenCalled()
  })
})

describe('purgeExpiredTokens', () => {
  it('deletes expired tokens', async () => {
    db.delete.mockClear()
    await purgeExpiredTokens()
    expect(db.delete).toHaveBeenCalled()
  })
})