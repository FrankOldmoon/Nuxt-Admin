import { createError } from 'h3'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isDev = process.env.NODE_ENV !== 'production'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  const email = body?.email?.trim().toLowerCase()

  if (!email || !EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid email' })
  }

  // Rate limit: max 5 forgot-password requests per IP+email every hour (prevents email bombing)
  await enforceRateLimit(event, { keyPrefix: 'forgot', max: 5, windowMs: 60 * 60 * 1000, identifier: email })

  // Best-effort cleanup of expired tokens
  await purgeExpiredPasswordResetTokens().catch(() => {})

  const user = await findUserByEmail(email)
  if (!user) {
    // Return success to prevent email enumeration
    return { ok: true, message: 'If the email exists, a reset link has been generated' }
  }

  const ttlMinutes = await getConfigValue<number>('security.passwordResetTtlMinutes', 30)
  const token = await createPasswordResetToken(user.id, ttlMinutes)
  const origin = getRequestURL(event).origin
  const resetUrl = `${origin}/reset-password?token=${token}`

  const mailConfigured = await isMailConfigured()
  let mailSent = false
  let mailError: string | undefined

  if (mailConfigured) {
    const result = await sendPasswordResetEmail(user.email, resetUrl, {
      username: user.username,
      ttlMinutes
    })
    mailSent = result.sent
    mailError = result.error
  }

  // When mail isn't delivered (no SMTP or send failed):
  // - dev: fall back to returning the reset link so the flow is still testable
  // - prod: log the failure but keep the response generic (no token leak)
  if (!mailSent) {
    if (mailError) {
      console.error(`[auth] Failed to send password reset email to ${user.email}:`, mailError)
    } else if (!mailConfigured) {
      console.warn('[auth] SMTP host not configured; password reset email was not sent.')
    }

    if (isDev) {
      return {
        ok: true,
        message: 'If the email exists, a reset link has been generated',
        devResetUrl: resetUrl,
        devToken: token
      }
    }
  }

  return { ok: true, message: 'If the email exists, a reset link has been generated' }
})
