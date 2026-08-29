import { createError } from 'h3'

const isDev = process.env.NODE_ENV !== 'production'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)

  if (ctx.user.emailVerifiedAt) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Email is already verified' })
  }

  const ttlMinutes = await getConfigValue<number>('security.emailVerificationTtlMinutes', 1440)
  const origin = getRequestURL(event).origin
  const result = await issueAndSendEmailVerification({
    userId: ctx.user.id,
    email: ctx.user.email,
    username: ctx.user.username,
    origin,
    ttlMinutes,
    isDev
  })

  return {
    ok: true,
    message: 'Verification email sent',
    ...(result.devVerifyUrl ? { devVerifyUrl: result.devVerifyUrl, devToken: result.devToken } : {})
  }
})
