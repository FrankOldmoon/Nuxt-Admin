import { createError } from 'h3'
import { findUserById } from '~~/server/utils/users'
import { revokeMembership } from '~~/server/utils/membership'

// POST /api/membership/admin/revoke — cancel all active memberships for a user (admin only).
// body: { userId: number, note?: string }
export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)

  const body = await readBody<{ userId?: number, note?: string }>(event)
  const userId = Math.floor(Number(body?.userId))
  if (!userId || userId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'userId is required' })
  }
  const user = await findUserById(userId)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }

  const cancelled = await revokeMembership(userId, auth.user.id, body?.note?.trim()?.slice(0, 255) || null)
  return { ok: true, cancelled }
})
