import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '~~/server/database'
import { membershipPlans } from '~~/server/database/schema'
import { isMembershipEnabled } from '~~/server/utils/membership'
import { isStripeEnabled } from '~~/server/utils/stripe'
import { isWxPayEnabled } from '~~/server/utils/wxPay'

// GET /api/membership/plans — public pricing list (active, non-deleted plans).
// Also reports which payment channels are available so the page can render only
// the buttons it can actually fulfil.
export default defineEventHandler(async () => {
  const [enabled, stripe, wechat] = await Promise.all([
    isMembershipEnabled(),
    isStripeEnabled(),
    isWxPayEnabled()
  ])
  const rows = await db.select().from(membershipPlans)
    .where(and(eq(membershipPlans.isActive, true), isNull(membershipPlans.deletedAt)))
    .orderBy(asc(membershipPlans.sortOrder), asc(membershipPlans.id))
  return {
    enabled,
    payments: { stripe, wechat },
    plans: rows
  }
})
