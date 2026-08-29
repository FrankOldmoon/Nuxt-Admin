import {
  createTypedToken,
  verifyTypedToken,
  consumeTypedToken,
  purgeExpiredTokens,
  purgeUserTypedTokens
} from './tokens'
import { isMailConfigured, sendEmailVerificationEmail } from './mail'

const DEFAULT_TTL_MINUTES = 1440

export interface EmailVerificationPayload {
  uid: number
}

// Create an email verification token. Persists a SHA-256 hash in the tokens table.
export async function createEmailVerificationToken(userId: number, ttlMinutes = DEFAULT_TTL_MINUTES): Promise<string> {
  const { token } = await createTypedToken(userId, 'email_verify', ttlMinutes)
  return token
}

// Verify an email verification token. Returns the user id if valid.
export async function verifyEmailVerificationToken(token: string): Promise<EmailVerificationPayload | null> {
  const uid = await verifyTypedToken(token, 'email_verify')
  return uid ? { uid } : null
}

// Consume (delete) an email verification token after use.
export async function consumeEmailVerificationToken(token: string): Promise<void> {
  await consumeTypedToken(token, 'email_verify')
}

// Cleanup expired tokens of all types (session, password_reset, email_verify).
export async function purgeExpiredEmailVerificationTokens(): Promise<void> {
  await purgeExpiredTokens()
}

// Remove all email verification tokens for a user (e.g. before issuing a fresh one).
export async function purgeUserEmailVerificationTokens(userId: number): Promise<void> {
  await purgeUserTypedTokens(userId, 'email_verify')
}

/**
 * Issue a fresh verification token for a user and send the verification email.
 * Replaces any prior tokens for that user.
 *
 * Returns:
 *   - { sent: true } when SMTP is configured and the email was sent
 *   - { sent: false, devVerifyUrl, devToken } in dev when SMTP is not configured
 *   - { sent: false } in prod when SMTP send fails (logged server-side)
 */
export async function issueAndSendEmailVerification(opts: {
  userId: number
  email: string
  username?: string
  origin: string
  ttlMinutes: number
  isDev: boolean
}): Promise<{ sent: boolean, devVerifyUrl?: string, devToken?: string }> {
  // Clean up old tokens before issuing a new one
  await purgeUserEmailVerificationTokens(opts.userId).catch(() => {})
  await purgeExpiredEmailVerificationTokens().catch(() => {})

  const token = await createEmailVerificationToken(opts.userId, opts.ttlMinutes)
  const verifyUrl = `${opts.origin}/verify-email?token=${token}`

  const mailConfigured = await isMailConfigured()
  if (mailConfigured) {
    const result = await sendEmailVerificationEmail(opts.email, verifyUrl, {
      username: opts.username,
      ttlMinutes: opts.ttlMinutes
    })
    if (result.sent) {
      return { sent: true }
    }
    console.error(`[auth] Failed to send verification email to ${opts.email}:`, result.error)
  } else if (opts.isDev) {
    console.warn('[auth] SMTP host not configured; verification email was not sent.')
    return { sent: false, devVerifyUrl: verifyUrl, devToken: token }
  } else {
    console.warn('[auth] SMTP host not configured; verification email was not sent.')
  }
  return { sent: false }
}
