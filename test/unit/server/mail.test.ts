import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendMailFn, createTransport, configHost } = vi.hoisted(() => {
  const sendMailFn = vi.fn()
  const createTransport = vi.fn(() => ({ sendMail: sendMailFn }))
  const configHost = { current: '' }
  return { sendMailFn, createTransport, configHost }
})

vi.mock('nodemailer', () => ({
  default: { createTransport }
}))
vi.mock('../../../server/utils/configs', () => ({
  getConfigValue: vi.fn(async (key: string, fallback: unknown) => {
    switch (key) {
      case 'mail.host': return configHost.current
      case 'mail.port': return 587
      case 'mail.secure': return false
      case 'mail.user': return ''
      case 'mail.pass': return ''
      case 'mail.from': return 'no-reply@example.com'
      default: return fallback
    }
  })
}))

import { isMailConfigured, sendPasswordResetEmail, sendEmailVerificationEmail } from '../../../server/utils/mail'

describe('isMailConfigured', () => {
  beforeEach(() => configHost.current = '')

  it('returns false when host is not configured', async () => {
    expect(await isMailConfigured()).toBe(false)
  })

  it('returns true when host is configured', async () => {
    configHost.current = 'smtp.example.com'
    expect(await isMailConfigured()).toBe(true)
  })
})

describe('sendPasswordResetEmail', () => {
  beforeEach(() => {
    configHost.current = ''
    sendMailFn.mockReset()
  })

  it('returns not-sent when SMTP is not configured', async () => {
    const res = await sendPasswordResetEmail('a@example.com', 'http://x/reset')
    expect(res.sent).toBe(false)
    expect(res.error).toBeDefined()
    expect(sendMailFn).not.toHaveBeenCalled()
  })

  it('sends successfully once configured', async () => {
    configHost.current = 'smtp.example.com'
    sendMailFn.mockResolvedValueOnce(undefined)
    const res = await sendPasswordResetEmail('a@example.com', 'http://x/reset', { ttlMinutes: 30 })
    expect(res.sent).toBe(true)
    expect(createTransport).toHaveBeenCalled()
    expect(sendMailFn).toHaveBeenCalled()
    const arg = sendMailFn.mock.calls[0][0]
    expect(arg.to).toBe('a@example.com')
    expect(arg.html).toContain('http://x/reset')
    expect(arg.html).not.toContain('<script>')
  })

  it('returns the error message when sending fails', async () => {
    configHost.current = 'smtp.example.com'
    sendMailFn.mockRejectedValueOnce(new Error('SMTP 500'))
    const res = await sendPasswordResetEmail('a@example.com', 'http://x/reset')
    expect(res.sent).toBe(false)
    expect(res.error).toBe('SMTP 500')
  })
})

describe('sendEmailVerificationEmail', () => {
  beforeEach(() => {
    configHost.current = ''
    sendMailFn.mockReset()
  })

  it('sends the verification email once configured', async () => {
    configHost.current = 'smtp.example.com'
    sendMailFn.mockResolvedValueOnce(undefined)
    const res = await sendEmailVerificationEmail('a@example.com', 'http://x/verify', { ttlMinutes: 1440 })
    expect(res.sent).toBe(true)
    expect(sendMailFn.mock.calls[0][0].html).toContain('http://x/verify')
  })
})