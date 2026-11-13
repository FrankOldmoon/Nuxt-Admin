import { describe, expect, it } from 'vitest'
import { authorize, permMatches, roleCanAccessTable, roleCanTableAction } from '../../../../server/core/permissions'

describe('permMatches', () => {
  it('supports wildcard, table and table:action entries', () => {
    expect(permMatches('*', 'any')).toBe(true)
    expect(permMatches('posts', 'posts')).toBe(true)
    expect(permMatches('posts', 'posts', 'delete')).toBe(true)
    expect(permMatches('posts:read', 'posts', 'read')).toBe(true)
    expect(permMatches('posts:read', 'posts', 'create')).toBe(false)
    expect(permMatches('posts:read', 'roles')).toBe(false)
  })
})

describe('authorize', () => {
  it('denies non-admins access to admin-only resources', () => {
    expect(authorize({ userId: 1, roleName: 'editor', permissions: ['*'] }, { table: 'users' }))
      .toEqual({ allowed: false, reason: 'admin-only' })
  })

  it('lets admins through admin-only resources', () => {
    expect(authorize({ userId: 1, roleName: 'admin', permissions: [] }, { table: 'users', action: 'delete' }))
      .toEqual({ allowed: true, reason: 'allowed' })
  })

  it('requires the requested action for regular resources', () => {
    const ctx = { userId: 1, roleName: 'author', permissions: ['example:read'] }
    expect(authorize(ctx, { table: 'example', action: 'read' }).allowed).toBe(true)
    expect(authorize(ctx, { table: 'example', action: 'create' }))
      .toEqual({ allowed: false, reason: 'action-denied' })
  })

  it('accepts canonical module resource permissions', () => {
    const permissions = { read: 'sis.students.read', create: 'sis.students.create' }
    const ctx = { userId: 1, roleName: 'teacher', permissions: ['sis.students.read'] }
    expect(authorize(ctx, { table: 'students', action: 'read', permissions }).allowed).toBe(true)
    expect(authorize(ctx, { table: 'students', action: 'create', permissions }))
      .toEqual({ allowed: false, reason: 'action-denied' })
  })

  it('denies when the role has no permissions at all', () => {
    expect(authorize({ userId: 1, permissions: [] }, { table: '' }))
      .toEqual({ allowed: false, reason: 'no-access' })
    expect(authorize({ userId: 1, permissions: ['posts:read'] }, { table: '' }).allowed).toBe(true)
  })
})

describe('role helpers', () => {
  it('accepts readonly permission arrays', () => {
    const permissions = ['example:read'] as const
    expect(roleCanAccessTable(permissions, 'example')).toBe(true)
    expect(roleCanTableAction(permissions, 'example', 'read')).toBe(true)
    expect(roleCanTableAction(permissions, 'example', 'update')).toBe(false)
    expect(roleCanTableAction(null, 'example')).toBe(false)
  })
})
