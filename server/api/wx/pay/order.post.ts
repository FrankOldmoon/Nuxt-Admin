import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { createJsapiOrder } from '~~/server/utils/wxPay'

// POST /api/wx/pay/order — JSAPI 统一下单（小程序用户）
// body: { amount: number (分, >0), description: string, outTradeNo?: string }
// 返回 wx.requestPayment 所需参数 { timeStamp, nonceStr, package, signType, paySign } + outTradeNo
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

  // 商户订单号：毫秒时间戳 + 4 位随机，≤32 字符
  const outTradeNo = (body?.outTradeNo?.trim() || `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`).slice(0, 32)

  // 先落库 pending，再调微信下单（失败则标记 closed）
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
