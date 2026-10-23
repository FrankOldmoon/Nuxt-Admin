import { createError, getRequestURL } from 'h3'
import { eq } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db } from '~~/server/database'
import { stripeOrders } from '~~/server/database/schema'
import { getStripeConfig, createCheckoutSession } from '~~/server/utils/stripe'

// POST /api/stripe/pay/order — create a Stripe Checkout session (logged-in users)
// body: { amount: number (in cents, >0), description: string, outTradeNo?: string, email?: string }
// Returns { outTradeNo, sessionId, url } — redirect the browser to `url` to pay.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)

  const body = await readBody<{ amount?: number, description?: string, outTradeNo?: string, email?: string }>(event)
  const amount = Math.floor(Number(body?.amount))
  if (!amount || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'amount (in cents) must be a positive integer' })
  }
  const description = body?.description?.trim()
  if (!description) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'description is required' })
  }

  const cfg = await getStripeConfig()

  // Merchant order number: millisecond timestamp + 4 random digits
  const outTradeNo = (body?.outTradeNo?.trim() || `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`).slice(0, 64)

  // Persist as pending first, then create the session (mark closed on failure)
  const [order] = await db.insert(stripeOrders).values({
    outTradeNo,
    userId: auth.user.id,
    email: (body?.email?.trim() || auth.user.email || null)?.slice(0, 255) ?? null,
    amount,
    currency: cfg.currency,
    description: description.slice(0, 255),
    status: 'pending'
  }).returning()
  if (!order) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create order' })
  }

  try {
    // Stripe requires absolute success/cancel URLs; resolve relative config paths against the request origin.
    const origin = getRequestURL(event).origin
    const absolute = (path: string) => /^https?:\/\//i.test(path) ? path : `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    const result = await createCheckoutSession({
      outTradeNo,
      description,
      amountCents: amount,
      currency: cfg.currency,
      customerEmail: order.email,
      successUrl: absolute(cfg.successUrl),
      cancelUrl: absolute(cfg.cancelUrl),
      secretKey: cfg.secretKey
    })
    await db.update(stripeOrders).set({ sessionId: result.sessionId, updatedAt: new Date() })
      .where(eq(stripeOrders.id, order.id))
    console.log('[stripe] checkout session created:', outTradeNo, '| amount:', amount, cfg.currency, '| session:', result.sessionId)
    return { outTradeNo, sessionId: result.sessionId, url: result.url }
  } catch (e) {
    await db.update(stripeOrders).set({ status: 'closed', updatedAt: new Date() }).where(eq(stripeOrders.id, order.id))
    throw e
  }
})
