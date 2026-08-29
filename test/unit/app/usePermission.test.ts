import { describe, it, expect } from 'vitest'
import { permMatches } from '../../../app/composables/usePermission'

describe('permMatches', () => {
  it('wildcard matches everything', () => {
    expect(permMatches('*', 'users')).toBe(true)
    expect(permMatches('*', 'users', 'read')).toBe(true)
    expect(permMatches('*', 'roles', 'delete')).toBe(true)
  })

  it('plain table name matches any action on that table', () => {
    expect(permMatches('users', 'users')).toBe(true)
    expect(permMatches('users', 'users', 'read')).toBe(true)
    expect(permMatches('users', 'users', 'delete')).toBe(true)
  })

  it('table:action matches specific action', () => {
    expect(permMatches('users:read', 'users', 'read')).toBe(true)
    expect(permMatches('users:read', 'users', 'create')).toBe(false)
    expect(permMatches('users:delete', 'users', 'create')).toBe(false)
  })

  it('returns false for different table', () => {
    expect(permMatches('users', 'roles')).toBe(false)
    expect(permMatches('users:read', 'roles', 'read')).toBe(false)
  })

  it('table:action without action arg matches if table matches', () => {
    expect(permMatches('users:read', 'users')).toBe(true)
    expect(permMatches('users:read', 'roles')).toBe(false)
  })
})