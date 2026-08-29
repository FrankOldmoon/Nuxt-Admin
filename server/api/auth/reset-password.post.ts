import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string, password?: string }>(event)
  const token = body?.token
  const password = body?.password

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Token is required' })
  }
  if (!password || password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Password must be at least 8 characters' })
  }

  const payload = await verifyPasswordResetToken(token)
  if (!payload) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid or expired token' })
  }

  const user = await findUserById(payload.uid)
  if (!user || !user.isActive) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Account not found or disabled' })
  }

  await updateUserPassword(user.id, password)
  await consumePasswordResetToken(token)

  const role = await findRoleById(user.roleId)
  await startSession(event, user.id)

  // Refetch to get updated timestamps
  const updated = await findUserById(user.id)
  return { user: updated ? toPublicUser(updated, role) : null }
})
