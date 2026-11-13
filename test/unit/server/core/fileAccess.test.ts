import { afterEach, describe, expect, it } from 'vitest'
import {
  actorFromAuthContext,
  canAccessPrivateFile,
  createSignedFileUrl,
  verifySignedFileUrl
} from '../../../../server/core/fileAccess'

const privateFile = { userId: 10, visibility: 'private', organizationId: 5 }

describe('canAccessPrivateFile', () => {
  it('allows public files without an actor', () => {
    expect(canAccessPrivateFile(null, { ...privateFile, visibility: 'public' })).toBe(true)
  })

  it('requires authentication for private files', () => {
    expect(canAccessPrivateFile(null, privateFile)).toBe(false)
  })

  it('allows the owner and administrators', () => {
    expect(canAccessPrivateFile({ userId: 10, roleName: 'teacher' }, privateFile)).toBe(true)
    expect(canAccessPrivateFile({ userId: 99, roleName: 'admin' }, privateFile)).toBe(true)
  })

  it('allows organization members with files:read only', () => {
    expect(canAccessPrivateFile({ userId: 99, roleName: 'teacher', organizationId: 5, permissions: ['files:read'] }, privateFile)).toBe(true)
    expect(canAccessPrivateFile({ userId: 99, roleName: 'teacher', organizationId: 5, permissions: ['sis:read'] }, privateFile)).toBe(false)
    expect(canAccessPrivateFile({ userId: 99, roleName: 'teacher', organizationId: 6, permissions: ['files:read'] }, privateFile)).toBe(false)
  })

  it('denies cross-organization access even with files:read', () => {
    expect(canAccessPrivateFile({ userId: 99, organizationId: 6, permissions: ['files:read'] }, privateFile)).toBe(false)
  })
})

describe('signed file URLs', () => {
  afterEach(() => {
    delete process.env.FILE_SIGNING_SECRET
  })

  it('signs and verifies a non-expired URL', () => {
    process.env.FILE_SIGNING_SECRET = 'test-secret'
    const url = new URL(createSignedFileUrl('12/abc.txt', 60), 'http://local')
    expect(verifySignedFileUrl('12/abc.txt', url.searchParams.get('expires'), url.searchParams.get('signature'))).toBe(true)
  })

  it('rejects expired, tampered and missing signatures', () => {
    process.env.FILE_SIGNING_SECRET = 'test-secret'
    const expired = Math.floor(Date.now() / 1000) - 1
    expect(verifySignedFileUrl('12/abc.txt', expired, 'anything')).toBe(false)

    const url = new URL(createSignedFileUrl('12/abc.txt', 60), 'http://local')
    const signature = url.searchParams.get('signature')!
    expect(verifySignedFileUrl('12/other.txt', url.searchParams.get('expires'), signature)).toBe(false)
    expect(verifySignedFileUrl('12/abc.txt', url.searchParams.get('expires'), `${signature}x`)).toBe(false)
    expect(verifySignedFileUrl('12/abc.txt', undefined, undefined)).toBe(false)
  })

  it('fails closed when no signing secret is configured', () => {
    expect(verifySignedFileUrl('12/abc.txt', Math.floor(Date.now() / 1000) + 60, 'signature')).toBe(false)
    expect(() => createSignedFileUrl('12/abc.txt')).toThrow('FILE_SIGNING_SECRET')
  })
})

describe('actorFromAuthContext', () => {
  it('maps the effective role, permissions and organization', () => {
    const actor = actorFromAuthContext({
      user: { id: 7 },
      role: { name: 'teacher' },
      permissions: ['files:read'],
      organization: { id: 3, tenantId: 1 }
    } as never)
    expect(actor).toEqual({ userId: 7, roleName: 'teacher', permissions: ['files:read'], organizationId: 3 })
    expect(actorFromAuthContext(null)).toBeNull()
  })
})
