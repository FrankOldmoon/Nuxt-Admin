import { createError, getRequestURL } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db } from '~~/server/database'
import { membershipPlans, stripeOrders } from '~~/server/database/schema'
import { getStripeConfig, createCheckoutSession } from '~~/server/utils/stripe'
import { requireMembershipEnabled } from '~~/server/utils/membership'
import { getConfigValue } from '~~/server/utils/configs'

// POST /api/membership/subscribe — buy (or renew) a membership plan.
// body: { planId: number }
// Returns { outTradeNo, sessionId, url } — redirect the browser to `url` (Stripe Checkout).
// The membership period is activated by the Stripe webhook once payment succeeds
// (or by the order-query reconciliation if the webhook is lost).
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  await requireMembershipEnabled()

  const body = await readBody<{ planId?: number }>(event)
  const planId = Math.floor(Number(body?.planId))
  if (!planId || planId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'planId is required' })
  }

  const [plan] = await db.select().from(membershipPlans)
    .where(and(
      eq(membershipPlans.id, planId),
      eq(membershipPlans.isActive, true),
      isNull(membershipPlans.deletedAt)
    ))
    .limit(1)
  if (!plan) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Membership plan not found or inactive' })
  }

  const cfg = await getStripeConfig()
  const outTradeNo = `${Date.now()}${String(randomInt(0, 10000)).padStart(4, '0')}`.slice(0, 64)
  const description = `Membership: ${plan.nameEn} (${plan.durationDays} days)`

  // Persist the pending order first so the webhook always finds a local record
  const [order] = await db.insert(stripeOrders).values({
    outTradeNo,
    userId: auth.user.id,
    email: auth.user.email?.slice(0, 255) ?? null,
    amount: plan.priceCents,
    currency: plan.currency || cfg.currency,
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
    const absolute = (path: string) => /^https?:\/\//i.test(path)
      ? path
      : `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    // Membership redirects default to the pricing page (overridable in System Config).
    // The order number is appended so the page can reconcile the payment status
    // even if the webhook is delayed or lost.
    const successPath = (await getConfigValue<string>('membership.successUrl', '/membership')).trim() || '/membership'
    const cancelPath = (await getConfigValue<string>('membership.cancelUrl', '/membership')).trim() || '/membership'
    const successWithOrder = `${successPath}${successPath.includes('?') ? '&' : '?'}outTradeNo=${encodeURIComponent(outTradeNo)}`

    const result = await createCheckoutSession({
      outTradeNo,
      description,
      amountCents: plan.priceCents,
      currency: plan.currency || cfg.currency,
      customerEmail: order.email,
      successUrl: absolute(successWithOrder),
      cancelUrl: absolute(cancelPath),
      secretKey: cfg.secretKey,
      metadata: {
        bizType: 'membership',
        planId: plan.id,
        userId: auth.user.id
      }
    })

    await db.update(stripeOrders).set({ sessionId: result.sessionId, updatedAt: new Date() })
      .where(eq(stripeOrders.id, order.id))
    console.log('[membership] checkout session created | user:', auth.user.id, '| plan:', plan.id, '| order:', outTradeNo)
    return { outTradeNo, sessionId: result.sessionId, url: result.url }
  } catch (e) {
    await db.update(stripeOrders).set({ status: 'closed', updatedAt: new Date() }).where(eq(stripeOrders.id, order.id))
    throw e
  }
})
