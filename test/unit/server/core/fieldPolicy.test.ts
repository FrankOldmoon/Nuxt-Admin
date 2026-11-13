import { describe, expect, it } from 'vitest'
import {
  canAccessField,
  deniedWriteFields,
  hiddenFieldsFor,
  withoutHiddenFields
} from '../../../../server/core/fieldPolicy'

const policy = {
  salary: { read: ['admin', 'hr'], write: ['admin'] },
  email: { read: ['*'], write: ['admin', 'hr'] }
}

describe('canAccessField', () => {
  it('lets admins bypass every rule', () => {
    expect(canAccessField('admin', policy, 'salary', 'write')).toBe(true)
  })

  it('allows listed roles and wildcards', () => {
    expect(canAccessField('hr', policy, 'salary', 'read')).toBe(true)
    expect(canAccessField('author', policy, 'salary', 'read')).toBe(false)
    expect(canAccessField('author', policy, 'email', 'read')).toBe(true)
    expect(canAccessField('author', policy, 'email', 'write')).toBe(false)
  })

  it('keeps fields without a rule accessible', () => {
    expect(canAccessField('author', policy, 'title', 'read')).toBe(true)
    expect(canAccessField(null, undefined, 'title', 'write')).toBe(true)
  })
})

describe('field policy helpers', () => {
  it('computes hidden read fields per role', () => {
    expect([...hiddenFieldsFor('author', policy)]).toEqual(['salary'])
    expect([...hiddenFieldsFor('hr', policy)]).toEqual([])
    expect([...hiddenFieldsFor('admin', policy)]).toEqual([])
  })

  it('strips hidden fields without mutating the source row', () => {
    const row = { id: 1, salary: 100, email: 'a@x.com' }
    const visible = withoutHiddenFields(row, new Set(['salary']))
    expect(visible).toEqual({ id: 1, email: 'a@x.com' })
    expect(row.salary).toBe(100)
  })

  it('reports payload fields the role may not write', () => {
    expect(deniedWriteFields('author', policy, { salary: 1, title: 'x' })).toEqual(['salary'])
    expect(deniedWriteFields('hr', policy, { salary: 1, email: 'a@x.com' })).toEqual(['salary'])
    expect(deniedWriteFields('admin', policy, { salary: 1 })).toEqual([])
  })
})
