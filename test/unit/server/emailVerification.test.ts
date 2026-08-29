import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  createTypedToken: vi.fn(),
  verifyTypedToken: vi.fn(),
  consumeTypedToken: vi.fn(),
  purgeExpiredTokens: vi.fn(),
  purgeUserTypedTokens: vi.fn(),
  isMailConfigured: vi.fn(),
  sendEmailVerificationEmail: vi.fn()
}))

vi.mock('../../../server/utils/tokens', () => ({
  createTypedToken: h.createTypedToken,
  verifyTypedToken: h.verifyTypedToken,
  consumeTypedToken: h.consumeTypedToken,
  purgeExpiredTokens: h.purgeExpiredTokens,
  purgeUserTypedTokens: h.purgeUserTypedTokens
}))
vi.mock('../../../server/utils/mail', () => ({
  isMailConfigured: h.isMailConfigured,
  sendEmailVerificationEmail: h.sendEmailVerificationEmail
}))

import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  consumeEmailVerificationToken,
  purgeExpiredEmailVerificationTokens,
  purgeUserEmailVerificationTokens,
  issueAndSendEmailVerification
} from '../../../server/utils/email-verification'

beforeEach(() => {
  vi.clearAllMocks()
  h.createTypedToken.mockResolvedValue({ token: 'tok-123', expiresAt: new Date() })
})

describe('createEmailVerificationToken', () => {
  it('creates an email_verify token with a default TTL of 1440 minutes', async () => {
    const token = await createEmailVerificationToken(5)
    expect(token).toBe('tok-123')
    expect(h.createTypedToken).toHaveBeenCalledWith(5, 'email_verify', 1440)
  })

  it('supports a custom TTL', async () => {
    await createEmailVerificationToken(6, 60)
    expect(h.createTypedToken).toHaveBeenCalledWith(6, 'email_verify', 60)
  })
})

describe('verifyEmailVerificationToken', () => {
  it('returns { uid } for a valid token', async () => {
    h.verifyTypedToken.mockResolvedValueOnce(3)
    expect(await verifyEmailVerificationToken('valid')).toEqual({ uid: 3 })
    expect(h.verifyTypedToken).toHaveBeenCalledWith('valid', 'email_verify')
  })

  it('returns null for an invalid token', async () => {
    h.verifyTypedToken.mockResolvedValueOnce(null)
    expect(await verifyEmailVerificationToken('bad')).toBeNull()
  })
})

describe('consumeEmailVerificationToken', () => {
  it('consumes the token by email_verify type', async () => {
    await consumeEmailVerificationToken('used')
    expect(h.consumeTypedToken).toHaveBeenCalledWith('used', 'email_verify')
  })
})

describe('purgeExpiredEmailVerificationTokens', () => {
  it('delegates to purgeExpiredTokens', async () => {
    await purgeExpiredEmailVerificationTokens()
    expect(h.purgeExpiredTokens).toHaveBeenCalledTimes(1)
  })
})

describe('purgeUserEmailVerificationTokens', () => {
  it('cleans tokens by user and type', async () => {
    await purgeUserEmailVerificationTokens(8)
    expect(h.purgeUserTypedTokens).toHaveBeenCalledWith(8, 'email_verify')
  })
})

describe('issueAndSendEmailVerification', () => {
  const baseOpts = {
    userId: 5,
    email: 'a@x.com',
    username: 'alice',
    origin: 'http://localhost:3000',
    ttlMinutes: 60,
    isDev: true
  }

  it('returns { sent: true } when SMTP is configured and sends successfully', async () => {
    h.isMailConfigured.mockResolvedValueOnce(true)
    h.sendEmailVerificationEmail.mockResolvedValueOnce({ sent: true })
    const result = await issueAndSendEmailVerification(baseOpts)
    expect(result).toEqual({ sent: true })
    expect(h.sendEmailVerificationEmail).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:3000/verify-email?token=tok-123',
      { username: 'alice', ttlMinutes: 60 }
    )
  })

  it('cleans the user old tokens and expired tokens before sending', async () => {
    h.isMailConfigured.mockResolvedValueOnce(true)
    h.sendEmailVerificationEmail.mockResolvedValueOnce({ sent: true })
    await issueAndSendEmailVerification(baseOpts)
    expect(h.purgeUserTypedTokens).toHaveBeenCalledWith(5, 'email_verify')
    expect(h.purgeExpiredTokens).toHaveBeenCalledTimes(1)
  })

  it('returns devVerifyUrl and devToken when SMTP is not configured in dev', async () => {
    h.isMailConfigured.mockResolvedValueOnce(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await issueAndSendEmailVerification(baseOpts)
      expect(result).toEqual({
        sent: false,
        devVerifyUrl: 'http://localhost:3000/verify-email?token=tok-123',
        devToken: 'tok-123'
      })
      expect(h.sendEmailVerificationEmail).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('returns only { sent: false } when SMTP is not configured in production', async () => {
    h.isMailConfigured.mockResolvedValueOnce(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await issueAndSendEmailVerification({ ...baseOpts, isDev: false })
      expect(result).toEqual({ sent: false })
      expect(result.devVerifyUrl).toBeUndefined()
      expect(result.devToken).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })

  it('returns { sent: false } and logs an error when SMTP sends fail', async () => {
    h.isMailConfigured.mockResolvedValueOnce(true)
    h.sendEmailVerificationEmail.mockResolvedValueOnce({ sent: false, error: new Error('smtp down') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await issueAndSendEmailVerification({ ...baseOpts, isDev: false })
      expect(result).toEqual({ sent: false })
      expect(err).toHaveBeenCalled()
    } finally {
      err.mockRestore()
    }
  })

  it('a failing cleanup of old tokens does not block the send flow', async () => {
    h.purgeUserTypedTokens.mockRejectedValueOnce(new Error('db down'))
    h.isMailConfigured.mockResolvedValueOnce(true)
    h.sendEmailVerificationEmail.mockResolvedValueOnce({ sent: true })
    const result = await issueAndSendEmailVerification(baseOpts)
    expect(result).toEqual({ sent: true })
    expect(h.createTypedToken).toHaveBeenCalledWith(5, 'email_verify', 60)
  })
})
