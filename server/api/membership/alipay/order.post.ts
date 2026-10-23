import { createError, getRequestURL } from 'h3'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { alipayOrders } from '~~/server/database/schema'
import { buildAlipayPagePayUrl, getAlipayConfig } from '~~/server/utils/alipay'
import { getPurchasablePlan, membershipOrderDescription, requireMembershipEnabled } from '~~/server/utils/membership'
import { getConfigValue } from '~~/server/utils/configs'

// POST /api/membership/alipay/order — membership checkout with Alipay (web page pay).
// body: { planId: number }
// Returns { outTradeNo, payUrl } — redirect the browser to `payUrl` (Alipay cashier).
// The membership period is activated by /api/alipay/pay/notify once the payment
// succeeds (or by GET /api/membership/alipay/order when the callback is lost).
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  await requireMembershipEnabled()

  const body = await readBody<{ planId?: number }>(event)
  const planId = Math.floor(Number(body?.planId))
  if (!planId || planId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'planId is required' })
  }

  const plan = await getPurchasablePlan(planId)
  // Alipay settles in CNY only: the plan price is charged as-is in fen.
  if (plan.currency.toLowerCase() !== 'cny') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `Alipay requires a CNY plan (this plan is priced in ${plan.currency.toUpperCase()})`
    })
  }

  const cfg = await getAlipayConfig()
  const outTradeNo = `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`.slice(0, 64)
  const description = membershipOrderDescription(plan)

  const [order] = await db.insert(alipayOrders).values({
    outTradeNo,
    userId: auth.user.id,
    amount: plan.priceCents,
    description: description.slice(0, 255),
    status: 'pending',
    bizType: 'membership',
    bizRefId: plan.id
  }).returning()
  if (!order) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create order' })
  }

  try {
    const origin = getRequestURL(event).origin
    const successPath = (await getConfigValue<string>('membership.successUrl', '/membership')).trim() || '/membership'
    // Alipay appends its own params to return_url, so the order number goes in first
    const returnUrl = `${origin}${successPath}${successPath.includes('?') ? '&' : '?'}outTradeNo=${encodeURIComponent(outTradeNo)}&channel=alipay`

    const payUrl = await buildAlipayPagePayUrl({
      outTradeNo,
      subject: description,
      amountFen: plan.priceCents,
      notifyUrl: cfg.notifyUrl || `${origin}/api/alipay/pay/notify`,
      returnUrl
    })
    console.log('[membership] alipay order created | user:', auth.user.id, '| plan:', plan.id, '| order:', outTradeNo)
    return { outTradeNo, payUrl }
  } catch (e) {
    await db.update(alipayOrders).set({ status: 'closed', updatedAt: new Date() })
      .where(eq(alipayOrders.id, order.id))
    throw e
  }
})
