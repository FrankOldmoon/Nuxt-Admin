import { createError } from 'h3'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { createJsapiOrder } from '~~/server/utils/wxPay'
import { getPurchasablePlan, membershipOrderDescription, requireMembershipEnabled } from '~~/server/utils/membership'

// POST /api/wx/membership/order — membership checkout for the mini-program (JSAPI).
// Auth: wx token (call /api/wx/login first). body: { planId: number }
// Returns the params for wx.requestPayment { timeStamp, nonceStr, package, signType, paySign } + outTradeNo.
// The membership period is activated by /api/wx/pay/notify once the payment succeeds.
export default defineEventHandler(async (event) => {
  const wxUser = await requireWxUser(event)
  await requireMembershipEnabled()

  const body = await readBody<{ planId?: number }>(event)
  const planId = Math.floor(Number(body?.planId))
  if (!planId || planId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'planId is required' })
  }

  const plan = await getPurchasablePlan(planId)
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
    wxUserId: wxUser.id,
    openid: wxUser.openid,
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
    const result = await createJsapiOrder({
      openid: wxUser.openid,
      outTradeNo,
      description,
      amountFen: plan.priceCents
    })
    console.log('[membership] wechat jsapi order created | wxUser:', wxUser.id, '| plan:', plan.id, '| order:', outTradeNo)
    return { outTradeNo, ...result.payment }
  } catch (e) {
    await db.update(wxPayOrders).set({ status: 'closed', updatedAt: new Date() }).where(eq(wxPayOrders.id, order.id))
    throw e
  }
})
