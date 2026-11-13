import { describe, expect, it } from 'vitest'
import {
  applyReadPolicy,
  canAccessField,
  deniedWriteFields,
  filterReadableFields,
  filterWritableFields,
  hiddenFieldsFor,
  maskedFieldsFor
} from '../../../../server/core/fieldPolicy'

const policy = {
  salary: ['admin', 'hr'],
  email: ['*'],
  ssn: { readPermission: 'users:ssn', mask: true },
  notes: { writable: false }
}

const admin = { roleName: 'admin', permissions: ['*'] }
const hr = { roleName: 'hr', permissions: ['users:read', 'users:ssn'] }
const author = { roleName: 'author', permissions: ['posts:read'] }

describe('canAccessField (role lists)', () => {
  it('allows admins unless the field is sensitive', () => {
    expect(canAccessField(admin, policy, 'salary', 'read')).toBe(true)
    expect(canAccessField(admin, { tokenHash: ['admin'] }, 'tokenHash', 'read')).toBe(false)
  })

  it('matches role names and wildcards', () => {
    expect(canAccessField(hr, policy, 'salary', 'read')).toBe(true)
    expect(canAccessField(author, policy, 'salary', 'read')).toBe(false)
    expect(canAccessField(author, policy, 'email', 'read')).toBe(true)
  })
})

describe('canAccessField (explicit rules)', () => {
  it('checks read/write permissions', () => {
    expect(canAccessField(hr, policy, 'ssn', 'read')).toBe(true)
    expect(canAccessField(author, policy, 'ssn', 'read')).toBe(false)
  })

  it('honours readable/writable flags', () => {
    expect(canAccessField(author, policy, 'notes', 'write')).toBe(false)
    expect(canAccessField(author, { notes: { readable: false } }, 'notes', 'read')).toBe(false)
  })

  it('never exposes credential-like columns and only writes them explicitly', () => {
    expect(canAccessField(admin, undefined, 'passwordHash', 'read')).toBe(false)
    expect(canAccessField(admin, undefined, 'clientSecret', 'read')).toBe(false)
    expect(canAccessField(admin, undefined, 'apiKey', 'read')).toBe(false)
    expect(canAccessField(admin, undefined, 'tokenHash', 'write')).toBe(false)
    expect(canAccessField(admin, { tokenHash: { writable: true } }, 'tokenHash', 'write')).toBe(true)
  })

  it('keeps fields without a rule accessible', () => {
    expect(canAccessField(author, policy, 'title', 'read')).toBe(true)
    expect(canAccessField({}, undefined, 'title', 'write')).toBe(true)
  })
})

describe('read policy helpers', () => {
  it('computes hidden and masked keys', () => {
    expect([...hiddenFieldsFor(author, policy)]).toEqual(['salary', 'ssn'])
    expect([...hiddenFieldsFor(hr, policy)]).toEqual([])
    expect([...maskedFieldsFor(hr, policy)]).toEqual(['ssn'])
    expect([...maskedFieldsFor(author, policy)]).toEqual([])
  })

  it('hides unreadable fields and masks the rest, including credentials', () => {
    const row = { id: 1, salary: 100, ssn: '123-45-6789', email: 'a@x.com', tokenHash: 'abc', name: 'A' }
    expect(applyReadPolicy(author, policy, row)).toEqual({ id: 1, email: 'a@x.com', name: 'A' })
    expect(applyReadPolicy(hr, policy, row)).toEqual({ id: 1, salary: 100, ssn: '***', email: 'a@x.com', name: 'A' })
    expect(row.salary).toBe(100)
  })

  it('reports payload fields the role may not write', () => {
    expect(deniedWriteFields(author, policy, { salary: 1, notes: 'x', title: 'y' })).toEqual(['salary', 'notes'])
    expect(deniedWriteFields(hr, policy, { salary: 1 })).toEqual([])
    expect(deniedWriteFields(admin, policy, { salary: 1 })).toEqual([])
  })

  it('exposes the task-book filter aliases', () => {
    const row = { id: 1, salary: 100, tokenHash: 'abc', name: 'A' }
    expect(filterReadableFields(author, policy, row)).toEqual({ id: 1, name: 'A' })
    expect(filterWritableFields(author, policy, { salary: 1, title: 'x' })).toEqual({ title: 'x' })
    expect(filterWritableFields(admin, policy, { salary: 1 })).toEqual({ salary: 1 })
  })
})
