import { isMembershipEnabled, getActiveMembership } from '~~/server/utils/membership'

// GET /api/membership/me — the current user's membership status.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  const enabled = await isMembershipEnabled()
  const active = await getActiveMembership(auth.user.id)
  return {
    enabled,
    isMember: active !== null,
    membership: active
      ? {
          planId: active.subscription.planId,
          planName: active.plan?.nameEn ?? null,
          planNameZh: active.plan?.nameZh ?? null,
          status: active.subscription.status,
          startsAt: active.subscription.startsAt,
          expiresAt: active.subscription.expiresAt,
          daysLeft: active.daysLeft,
          source: active.subscription.source
        }
      : null
  }
})
