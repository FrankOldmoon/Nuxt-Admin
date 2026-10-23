import { createError, getRequestURL } from 'h3'
import { eq } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db } from '~~/server/database'
import { alipayOrders } from '~~/server/database/schema'
import { buildAlipayPagePayUrl, getAlipayConfig } from '~~/server/utils/alipay'

// POST /api/alipay/pay/order — create a generic Alipay page-pay order (web users).
// body: { amount: number (cents/fen, >0), description: string, outTradeNo?: string, returnUrl?: string }
// Returns { outTradeNo, payUrl } — redirect the browser to `payUrl` (Alipay cashier).
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)

  const body = await readBody<{
    amount?: number
    description?: string
    outTradeNo?: string
    returnUrl?: string
  }>(event)
  const amount = Math.floor(Number(body?.amount))
  if (!amount || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'amount (in cents/fen) must be a positive integer' })
  }
  const description = body?.description?.trim()
  if (!description) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'description is required' })
  }

  const cfg = await getAlipayConfig()
  const outTradeNo = (body?.outTradeNo?.trim() || `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`).slice(0, 64)
  const [order] = await db.insert(alipayOrders).values({
    outTradeNo,
    userId: auth.user.id,
    amount,
    description: description.slice(0, 255),
    status: 'pending'
  }).returning()
  if (!order) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create order' })
  }

  try {
    const origin = getRequestURL(event).origin
    const absolute = (path: string) => /^https?:\/\//i.test(path)
      ? path
      : `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    const payUrl = await buildAlipayPagePayUrl({
      outTradeNo,
      subject: description,
      amountFen: amount,
      notifyUrl: cfg.notifyUrl || `${origin}/api/alipay/pay/notify`,
      // Return the payer to the provided page; the order number lets that page
      // reconcile the payment status by itself.
      returnUrl: absolute(`${body?.returnUrl?.trim() || '/'}${(body?.returnUrl || '/').includes('?') ? '&' : '?'}outTradeNo=${encodeURIComponent(outTradeNo)}&channel=alipay`)
    })
    console.log('[alipay] order created:', outTradeNo, '| amount:', amount)
    return { outTradeNo, payUrl }
  } catch (e) {
    await db.update(alipayOrders).set({ status: 'closed', updatedAt: new Date() }).where(eq(alipayOrders.id, order.id))
    throw e
  }
})
