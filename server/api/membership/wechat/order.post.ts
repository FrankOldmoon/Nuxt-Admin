import { createError } from 'h3'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { createNativeOrder } from '~~/server/utils/wxPay'
import { getPurchasablePlan, membershipOrderDescription, requireMembershipEnabled } from '~~/server/utils/membership'

// POST /api/membership/wechat/order — membership checkout for the website (Native pay).
// body: { planId: number }
// Returns { outTradeNo, codeUrl } — the client renders `codeUrl` as a QR code;
// the payer scans it in WeChat and the order is fulfilled by /api/wx/pay/notify
// (or by GET /api/membership/wechat/order when the callback is lost).
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  await requireMembershipEnabled()

  const body = await readBody<{ planId?: number }>(event)
  const planId = Math.floor(Number(body?.planId))
  if (!planId || planId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'planId is required' })
  }

  const plan = await getPurchasablePlan(planId)
  // WeChat Pay is CNY-only: the plan price is charged as-is in fen.
  if (plan.currency.toLowerCase() !== 'cny') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `WeChat Pay requires a CNY plan (this plan is priced in ${plan.currency.toUpperCase()})`
    })
  }

  const outTradeNo = `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`.slice(0, 32)
  const description = membershipOrderDescription(plan)

  const [order] = await db.insert(wxPayOrders).values({
    outTradeNo,
    userId: auth.user.id,
    amount: plan.priceCents,
    description: description.slice(0, 127),
    status: 'pending',
    bizType: 'membership',
    bizRefId: plan.id
  }).returning()
  if (!order) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create order' })
  }

  try {
    const { codeUrl } = await createNativeOrder({
      outTradeNo,
      description,
      amountFen: plan.priceCents
    })
    console.log('[membership] wechat native order created | user:', auth.user.id, '| plan:', plan.id, '| order:', outTradeNo)
    return { outTradeNo, codeUrl, amount: plan.priceCents, currency: 'cny' }
  } catch (e) {
    await db.update(wxPayOrders).set({ status: 'closed', updatedAt: new Date() }).where(eq(wxPayOrders.id, order.id))
    throw e
  }
})
