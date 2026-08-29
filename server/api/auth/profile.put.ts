import { createError } from 'h3'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GENDER_VALUES = ['male', 'female', 'other']

const isDev = process.env.NODE_ENV !== 'production'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{
    username?: string
    name?: string | null
    email?: string
    telephone?: string | null
    avatarPath?: string | null
    gender?: string | null
    birthday?: string | null
  }>(event)

  const username = body?.username?.trim()
  const name = body?.name === null || body?.name === '' ? null : body?.name?.trim()
  const email = body?.email?.trim().toLowerCase()
  const telephone = body?.telephone === null || body?.telephone === '' ? null : body?.telephone?.trim()
  const avatarPath = body?.avatarPath
  const gender = body?.gender === null || body?.gender === '' ? null : body?.gender
  const birthday = body?.birthday === null || body?.birthday === '' ? null : body?.birthday
  // avatarPath must be null or a non-empty string with no path traversal
  if (avatarPath !== undefined && avatarPath !== null) {
    if (typeof avatarPath !== 'string' || avatarPath.length === 0 || avatarPath.includes('..') || avatarPath.startsWith('/')) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid avatar path' })
    }
  }

  // Validate provided fields
  if (username !== undefined && !USERNAME_RE.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Username must be 3-50 chars (letters, digits, underscore)' })
  }
  if (email !== undefined && !EMAIL_RE.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid email' })
  }
  if (gender !== undefined && gender !== null && !GENDER_VALUES.includes(gender)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid gender value' })
  }
  if (birthday !== undefined && birthday !== null) {
    // Expect ISO date string YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(Date.parse(birthday))) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid birthday' })
    }
  }

  // Username is immutable from the profile endpoint
  if (username && username !== ctx.user.username) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Username cannot be changed' })
  }
  // Email uniqueness check (skip if unchanged)
  if (email && email !== ctx.user.email) {
    if (await findUserByEmail(email)) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Email already registered' })
    }
  }

  const emailChanged = !!email && email !== ctx.user.email

  const updated = await updateUserProfile(ctx.user.id, { username, name, email, telephone, avatarPath, gender, birthday })
  if (!updated) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to update profile' })
  }

  // When email changed: mark unverified and send a new verification email
  let devVerifyUrl: string | undefined
  let devToken: string | undefined
  if (emailChanged) {
    await markEmailUnverified(updated.id)
    const ttlMinutes = await getConfigValue<number>('security.emailVerificationTtlMinutes', 1440)
    const origin = getRequestURL(event).origin
    const result = await issueAndSendEmailVerification({
      userId: updated.id,
      email: updated.email,
      username: updated.username,
      origin,
      ttlMinutes,
      isDev
    })
    if (result.devVerifyUrl) {
      devVerifyUrl = result.devVerifyUrl
      devToken = result.devToken
    }
    // Refetch to reflect emailVerifiedAt=null
    const refetched = await findUserByEmail(updated.email)
    if (refetched) updated.emailVerifiedAt = refetched.emailVerifiedAt
  }

  const role = await findRoleById(updated.roleId)
  return {
    user: toPublicUser(updated, role),
    ...(devVerifyUrl ? { devVerifyUrl, devToken } : {})
  }
})
