import { createError } from 'h3'
import { findUserById } from '~~/server/utils/users'
import { activateMembership, getActiveMembership } from '~~/server/utils/membership'

// POST /api/membership/admin/grant — manually grant / extend a membership (admin only).
// body: { userId: number, planId?: number, durationDays?: number, note?: string }
// Either planId (duration taken from the plan) or an explicit durationDays is required.
export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)

  const body = await readBody<{ userId?: number, planId?: number, durationDays?: number, note?: string }>(event)
  const userId = Math.floor(Number(body?.userId))
  if (!userId || userId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'userId is required' })
  }
  const user = await findUserById(userId)
  if (!user || user.deletedAt) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
  }
  const planId = body?.planId ? Math.floor(Number(body.planId)) : null
  const durationDays = body?.durationDays ? Math.floor(Number(body.durationDays)) : null
  if (!planId && !durationDays) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'planId or durationDays is required' })
  }

  const subscription = await activateMembership({
    userId,
    planId,
    durationDays: durationDays ?? undefined,
    source: 'manual',
    grantedBy: auth.user.id,
    note: body?.note?.trim()?.slice(0, 255) || null
  })
  const active = await getActiveMembership(userId)
  return { ok: true, subscription, membership: active }
})
