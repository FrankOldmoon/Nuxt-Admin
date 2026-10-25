import { requireUser } from '~~/server/utils/auth'
import { getCreditBalance, getCreditHistory } from '~~/server/utils/credits'

// GET /api/credits/me — the signed-in user's balance and recent ledger rows.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  const [balance, history] = await Promise.all([
    getCreditBalance(auth.user.id),
    getCreditHistory(auth.user.id, 20)
  ])
  return { balance, history }
})
