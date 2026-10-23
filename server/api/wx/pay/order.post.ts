import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { createJsapiOrder } from '~~/server/utils/wxPay'

// POST /api/wx/pay/order — JSAPI unified order (mini-program users)
// body: { amount: number (in cents/fen, >0), description: string, outTradeNo?: string }
// Returns the params required by wx.requestPayment { timeStamp, nonceStr, package, signType, paySign } + outTradeNo
export default defineEventHandler(async (event) => {
  const wxUser = await requireWxUser(event)

  const body = await readBody<{ amount?: number, description?: string, outTradeNo?: string }>(event)
  const amount = Math.floor(Number(body?.amount))
  if (!amount || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'amount (in cents/fen) must be a positive integer' })
  }
  const description = body?.description?.trim()
  if (!description) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'description is required' })
  }

  // Merchant order number: millisecond timestamp + 4 random digits, ≤32 chars
  const outTradeNo = (body?.outTradeNo?.trim() || `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`).slice(0, 32)

  // Persist as pending first, then place the order with WeChat (mark closed on failure)
  const [order] = await db.insert(wxPayOrders).values({
    outTradeNo,
    wxUserId: wxUser.id,
    openid: wxUser.openid,
    amount,
    description: description.slice(0, 127),
    status: 'pending'
  }).returning()
  if (!order) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create order' })
  }

  try {
    const result = await createJsapiOrder({
      openid: wxUser.openid,
      outTradeNo,
      description,
      amountFen: amount
    })
    console.log('[wxpay] order created:', outTradeNo, '| amount:', amount, '| prepay_id:', result.prepayId)
    return { outTradeNo, ...result.payment }
  } catch (e) {
    await db.update(wxPayOrders).set({ status: 'closed', updatedAt: new Date() }).where(eq(wxPayOrders.id, order.id))
    throw e
  }
})
