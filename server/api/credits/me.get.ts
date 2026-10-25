import { requireUser } from '~~/server/utils/auth'
import { getCreditBalance, getCreditHistory, grantMonthlyMemberCredits } from '~~/server/utils/credits'

// GET /api/credits/me — the signed-in user's balance and recent ledger rows.
// Also the lazy entry point for the monthly member allowance: granting here
// keeps the badge correct without a cron job, and stays idempotent per month.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  await grantMonthlyMemberCredits(auth.user.id).catch((e) => {
    console.warn('[credits] monthly allowance check failed:', e)
  })
  const [balance, history] = await Promise.all([
    getCreditBalance(auth.user.id),
    getCreditHistory(auth.user.id, 20)
  ])
  return { balance, history }
})
