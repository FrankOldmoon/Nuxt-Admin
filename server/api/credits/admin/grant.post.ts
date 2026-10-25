import { createError, readBody } from 'h3'
import { findUserById } from '~~/server/utils/users'
import { grantCredits } from '~~/server/utils/credits'

// POST /api/credits/admin/grant — grant (or correct) a user's credits.
// body: { userId: number, amount: number, note?: string }
// A negative amount records an `adjust` row instead of a `grant`.
export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  const body = await readBody<{ userId?: number, amount?: number, note?: string }>(event)

  const userId = Math.floor(Number(body?.userId))
  if (!userId || userId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'userId is required' })
  }
  const amount = Math.floor(Number(body?.amount))
  if (!Number.isFinite(amount) || amount === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'amount must be a non-zero integer' })
  }
  const user = await findUserById(userId)
  if (!user || user.deletedAt) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }

  const result = await grantCredits({
    userId,
    amount,
    kind: amount > 0 ? 'grant' : 'adjust',
    note: body?.note?.slice(0, 255) || 'Admin grant',
    operatorId: auth.user.id
  })
  return { ok: true, ...result }
})
