import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{ currentPassword?: string, newPassword?: string }>(event)
  const currentPassword = body?.currentPassword
  const newPassword = body?.newPassword

  if (!currentPassword || !newPassword) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Current and new passwords are required' })
  }
  if (newPassword.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Password must be at least 8 characters' })
  }
  if (currentPassword === newPassword) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'New password must differ from the current one' })
  }

  // Re-fetch to get the password hash
  const user = await findUserById(ctx.user.id)
  if (!user || !checkPassword(currentPassword, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Current password is incorrect' })
  }

  await updateUserPassword(user.id, newPassword)
  const refreshed = await findUserById(user.id)
  const role = refreshed ? await findRoleById(refreshed.roleId) : null
  return { user: refreshed ? toPublicUser(refreshed, role) : null }
})
