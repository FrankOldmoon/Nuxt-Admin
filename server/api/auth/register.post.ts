import { createError } from 'h3'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isDev = process.env.NODE_ENV !== 'production'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string, email?: string, password?: string }>(event)
  const username = body?.username?.trim()
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!username || !USERNAME_RE.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Username must be 3-50 chars (letters, digits, underscore)' })
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid email' })
  }
  if (!password || password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Password must be at least 8 characters' })
  }

  // Rate limit: max 5 registrations per IP+email every hour
  await enforceRateLimit(event, { keyPrefix: 'register', max: 5, windowMs: 60 * 60 * 1000, identifier: email })

  const allowRegistration = await getConfigValue<boolean>('site.allowRegistration', true)
  if (!allowRegistration) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Public registration is disabled' })
  }

  if (await findUserByUsername(username)) {
    throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Username already taken' })
  }
  if (await findUserByEmail(email)) {
    throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Email already registered' })
  }

  const userRole = await findRoleByName('user')
  if (!userRole) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Default role not found' })
  }

  const user = await createUser({ username, email, password, roleId: userRole.id })
  await startSession(event, user.id)

  // Send verification email (best-effort). In dev without SMTP, returns devVerifyUrl/devToken.
  const ttlMinutes = await getConfigValue<number>('security.emailVerificationTtlMinutes', 1440)
  const origin = getRequestURL(event).origin
  const verifyResult = await issueAndSendEmailVerification({
    userId: user.id,
    email: user.email,
    username: user.username,
    origin,
    ttlMinutes,
    isDev
  })

  return {
    user: toPublicUser(user, userRole),
    ...(verifyResult.devVerifyUrl ? { devVerifyUrl: verifyResult.devVerifyUrl, devToken: verifyResult.devToken } : {})
  }
})
