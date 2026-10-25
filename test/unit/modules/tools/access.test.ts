import { describe, expect, it } from 'vitest'
import { blockReason, canViewCard, normalizeAccess } from '../../../../modules/tools/server/utils/access'
import type { ViewerContext } from '../../../../modules/tools/server/utils/access'

const anonymous: ViewerContext = { region: 'cn', loggedIn: false, isMember: false, isAdmin: false }
const user: ViewerContext = { region: 'cn', loggedIn: true, isMember: false, isAdmin: false }
const member: ViewerContext = { region: 'cn', loggedIn: true, isMember: true, isAdmin: false }
const admin: ViewerContext = { region: 'cn', loggedIn: true, isMember: false, isAdmin: true }

describe('normalizeAccess', () => {
  it('accepts the four levels and falls back to public', () => {
    expect(normalizeAccess('authenticated')).toBe('authenticated')
    expect(normalizeAccess('member')).toBe('member')
    expect(normalizeAccess('admin')).toBe('admin')
    expect(normalizeAccess('nonsense')).toBe('public')
    expect(normalizeAccess('')).toBe('public')
  })
})

describe('canViewCard', () => {
  it('shows public cards to everyone', () => {
    expect(canViewCard('all', 'public', anonymous)).toBe(true)
    expect(canViewCard('all', 'public', user)).toBe(true)
  })

  it('hides login-only cards from guests', () => {
    expect(canViewCard('all', 'authenticated', anonymous)).toBe(false)
    expect(canViewCard('all', 'authenticated', user)).toBe(true)
  })

  it('hides member cards from guests and signed-in non-members', () => {
    expect(canViewCard('all', 'member', anonymous)).toBe(false)
    expect(canViewCard('all', 'member', user)).toBe(false)
    expect(canViewCard('all', 'member', member)).toBe(true)
    expect(canViewCard('all', 'member', admin)).toBe(true)
  })

  it('keeps admin cards to administrators', () => {
    expect(canViewCard('all', 'admin', user)).toBe(false)
    expect(canViewCard('all', 'admin', admin)).toBe(true)
  })

  it('still respects the region filter', () => {
    const globalViewer: ViewerContext = { ...user, region: 'global' }
    expect(canViewCard('cn', 'public', globalViewer)).toBe(false)
    expect(canViewCard('global', 'public', globalViewer)).toBe(true)
  })
})

describe('blockReason', () => {
  it('reports the wall a viewer would hit', () => {
    expect(blockReason('public', anonymous)).toBe('none')
    expect(blockReason('authenticated', anonymous)).toBe('login')
    expect(blockReason('member', anonymous)).toBe('login')
    expect(blockReason('member', user)).toBe('member')
    expect(blockReason('member', member)).toBe('none')
    expect(blockReason('member', admin)).toBe('none')
    expect(blockReason('admin', user)).toBe('admin')
  })
})
