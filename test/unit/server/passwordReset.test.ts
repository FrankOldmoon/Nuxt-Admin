import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  createTypedToken: vi.fn(),
  verifyTypedToken: vi.fn(),
  consumeTypedToken: vi.fn(),
  purgeExpiredTokens: vi.fn(),
  purgeUserTypedTokens: vi.fn()
}))

vi.mock('../../../server/utils/tokens', () => ({
  createTypedToken: h.createTypedToken,
  verifyTypedToken: h.verifyTypedToken,
  consumeTypedToken: h.consumeTypedToken,
  purgeExpiredTokens: h.purgeExpiredTokens,
  purgeUserTypedTokens: h.purgeUserTypedTokens
}))

import {
  createPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
  purgeExpiredPasswordResetTokens,
  purgeUserPasswordResetTokens
} from '../../../server/utils/password-reset'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPasswordResetToken', () => {
  it('creates a password_reset token with a default TTL of 30 minutes', async () => {
    h.createTypedToken.mockResolvedValueOnce({ token: 'tok-abc', expiresAt: new Date() })
    const token = await createPasswordResetToken(5)
    expect(token).toBe('tok-abc')
    expect(h.createTypedToken).toHaveBeenCalledWith(5, 'password_reset', 30)
  })

  it('supports a custom TTL', async () => {
    h.createTypedToken.mockResolvedValueOnce({ token: 'tok-xyz', expiresAt: new Date() })
    await createPasswordResetToken(7, 120)
    expect(h.createTypedToken).toHaveBeenCalledWith(7, 'password_reset', 120)
  })
})

describe('verifyPasswordResetToken', () => {
  it('returns { uid } for a valid token', async () => {
    h.verifyTypedToken.mockResolvedValueOnce(9)
    expect(await verifyPasswordResetToken('valid-tok')).toEqual({ uid: 9 })
    expect(h.verifyTypedToken).toHaveBeenCalledWith('valid-tok', 'password_reset')
  })

  it('returns null for an invalid token', async () => {
    h.verifyTypedToken.mockResolvedValueOnce(null)
    expect(await verifyPasswordResetToken('bad-tok')).toBeNull()
  })

  it('returns null when verifyTypedToken returns 0 (a falsy uid)', async () => {
    h.verifyTypedToken.mockResolvedValueOnce(0)
    expect(await verifyPasswordResetToken('zero')).toBeNull()
  })
})

describe('consumePasswordResetToken', () => {
  it('consumes the token by password_reset type', async () => {
    await consumePasswordResetToken('used-tok')
    expect(h.consumeTypedToken).toHaveBeenCalledWith('used-tok', 'password_reset')
  })
})

describe('purgeExpiredPasswordResetTokens', () => {
  it('delegates to purgeExpiredTokens to clear all expired tokens', async () => {
    await purgeExpiredPasswordResetTokens()
    expect(h.purgeExpiredTokens).toHaveBeenCalledTimes(1)
  })
})

describe('purgeUserPasswordResetTokens', () => {
  it('cleans password_reset tokens by user and type', async () => {
    await purgeUserPasswordResetTokens(42)
    expect(h.purgeUserTypedTokens).toHaveBeenCalledWith(42, 'password_reset')
  })
})
