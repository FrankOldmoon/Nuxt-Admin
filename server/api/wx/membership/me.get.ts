import { isMembershipEnabled, getActiveMembership } from '~~/server/utils/membership'

// GET /api/wx/membership/me — membership status of the current mini-program user.
// Auth: wx token (call /api/wx/login first).
export default defineEventHandler(async (event) => {
  const wxUser = await requireWxUser(event)
  const [enabled, active] = await Promise.all([
    isMembershipEnabled(),
    getActiveMembership({ wxUserId: wxUser.id })
  ])
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
