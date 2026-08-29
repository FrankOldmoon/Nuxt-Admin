import { describe, it, expect } from 'vitest'
import { scryptSync } from 'node:crypto'
import { hashPassword, verifyPassword } from '../../../server/utils/password'

describe('hashPassword', () => {
  it('generates a salt:hash format with a 32-char hex salt and 128-char hex hash', () => {
    const stored = hashPassword('SuperSecret1')
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
  })

  it('uses a random salt: two hashes of the same password differ', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'))
  })

  it('the generated hash passes verifyPassword', () => {
    const stored = hashPassword('abc123')
    expect(verifyPassword('abc123', stored)).toBe(true)
  })
})

describe('verifyPassword', () => {
  it('correct password passes verification', () => {
    const stored = hashPassword('SuperSecret1')
    expect(verifyPassword('SuperSecret1', stored)).toBe(true)
  })

  it('wrong password fails verification', () => {
    const stored = hashPassword('SuperSecret1')
    expect(verifyPassword('WrongPass9', stored)).toBe(false)
  })

  it('a stored string without a colon separator returns false', () => {
    expect(verifyPassword('x', 'malformedstoredstring')).toBe(false)
  })

  it('an empty stored string returns false', () => {
    expect(verifyPassword('x', '')).toBe(false)
  })

  it('a hash that is not 128 hex chars returns false', () => {
    expect(verifyPassword('x', 'abcd:1234')).toBe(false)
  })

  it('an empty salt returns false', () => {
    const stored = hashPassword('pw')
    const [, hash] = stored.split(':')
    expect(verifyPassword('pw', `:${hash}`)).toBe(false)
  })

  it('different passwords under the same salt never match', () => {
    const stored = hashPassword('first-password')
    const [, salt] = stored.split(':')
    const other = scryptSync('second-password', salt, 64).toString('hex')
    expect(verifyPassword('second-password', `${salt}:${other}`)).toBe(true)
    expect(verifyPassword('first-password', stored)).toBe(true)
  })
})
