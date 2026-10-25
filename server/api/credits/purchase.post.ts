import { createError, getRequestURL, readBody } from 'h3'
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { alipayOrders } from '~~/server/database/schema'
import { buildAlipayPagePayUrl, getAlipayConfig, isAlipayEnabled } from '~~/server/utils/alipay'
import { findCreditPackage } from '~~/server/utils/credits'

// POST /api/credits/purchase — buy a credit pack with Alipay page pay.
// body: { packageId: number }
// Returns { outTradeNo, payUrl }; the balance is credited by
// /api/alipay/pay/notify (or by GET /api/credits/purchase on the return page).
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  if (!(await isAlipayEnabled())) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Self-serve top-up is not available yet; ask an administrator to grant credits'
    })
  }

  const body = await readBody<{ packageId?: number }>(event)
  const packageId = Math.floor(Number(body?.packageId))
  if (!packageId || packageId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'packageId is required' })
  }

  const pkg = await findCreditPackage(packageId)
  if (!pkg) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Credit package not found' })
  }

  const cfg = await getAlipayConfig()
  const outTradeNo = `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`.slice(0, 64)
  const description = `Credits: ${pkg.credits} (${pkg.title.en})`

  const [order] = await db.insert(alipayOrders).values({
    outTradeNo,
    userId: auth.user.id,
    amount: pkg.priceCents,
    description: description.slice(0, 255),
    status: 'pending',
    bizType: 'credits',
    bizRefId: pkg.id
  }).returning()
  if (!order) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create order' })
  }

  try {
    const origin = getRequestURL(event).origin
    const returnUrl = `${origin}/credits?outTradeNo=${encodeURIComponent(outTradeNo)}&channel=alipay`
    const payUrl = await buildAlipayPagePayUrl({
      outTradeNo,
      subject: description,
      amountFen: pkg.priceCents,
      notifyUrl: cfg.notifyUrl || `${origin}/api/alipay/pay/notify`,
      returnUrl
    })
    console.log('[credits] alipay top-up order created | user:', auth.user.id, '| package:', pkg.id, '| order:', outTradeNo)
    return { outTradeNo, payUrl }
  } catch (e) {
    await db.update(alipayOrders).set({ status: 'closed', updatedAt: new Date() })
      .where(eq(alipayOrders.id, order.id))
    throw e
  }
})
