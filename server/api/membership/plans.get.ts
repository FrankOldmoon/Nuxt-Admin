import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '~~/server/database'
import { membershipPlans } from '~~/server/database/schema'
import { isMembershipEnabled } from '~~/server/utils/membership'

// GET /api/membership/plans — public pricing list (active, non-deleted plans).
export default defineEventHandler(async () => {
  const enabled = await isMembershipEnabled()
  const rows = await db.select().from(membershipPlans)
    .where(and(eq(membershipPlans.isActive, true), isNull(membershipPlans.deletedAt)))
    .orderBy(asc(membershipPlans.sortOrder), asc(membershipPlans.id))
  return { enabled, plans: rows }
})
