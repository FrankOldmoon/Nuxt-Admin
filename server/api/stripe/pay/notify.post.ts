import { createError, getHeader, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { stripeOrders } from '~~/server/database/schema'
import { getStripeConfig, verifyStripeWebhookSignature } from '~~/server/utils/stripe'

// POST /api/stripe/pay/notify — Stripe webhook (called by Stripe servers, no local auth)
// Flow: verify Stripe-Signature → handle checkout.session.completed → validate amount
// → update the order → always ACK with 200 { received: true } (except bad signatures).
// Docs: https://docs.stripe.com/webhooks#verify-official-libraries
export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event)) ?? ''
  const signatureHeader = getHeader(event, 'stripe-signature') || ''
  if (!signatureHeader) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing Stripe-Signature header' })
  }

  // 1. Verify the signature against the raw body (any failure → 400/401, Stripe retries)
  const cfg = await getStripeConfig()
  if (!cfg.webhookSecret) {
    console.error('[stripe] notify: stripe.webhookSecret is not configured')
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Missing config: stripe.webhookSecret' })
  }
  if (!verifyStripeWebhookSignature(signatureHeader, rawBody, cfg.webhookSecret)) {
    console.error('[stripe] notify signature verification FAILED')
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid webhook signature' })
  }

  // 2. Parse the event; only checkout.session.completed marks an order as paid.
  interface StripeWebhookSession {
    id?: string
    client_reference_id?: string
    payment_intent?: string
    amount_total?: number
    metadata?: { out_trade_no?: string }
    customer_details?: { email?: string }
  }
  const webhook = JSON.parse(rawBody) as {
    type?: string
    data?: { object?: StripeWebhookSession }
  }
  const session = webhook.data?.object
  if (webhook.type === 'checkout.session.completed' && session) {
    const outTradeNo = (session.metadata?.out_trade_no ?? session.client_reference_id ?? '').toString()
    const sessionId = session.id?.toString() ?? ''
    const paymentIntentId = session.payment_intent?.toString() ?? null
    const amountTotal = Number(session.amount_total ?? 0)
    const email = session.customer_details?.email?.toString() ?? null

    if (!outTradeNo) {
      console.warn('[stripe] notify: session completed without out_trade_no | session:', sessionId)
    } else {
      const [order] = await db.select().from(stripeOrders)
        .where(eq(stripeOrders.outTradeNo, outTradeNo))
        .limit(1)
      if (!order) {
        console.warn('[stripe] notify: unknown order', outTradeNo)
      } else if (order.status === 'paid') {
        console.log('[stripe] notify: order already paid (idempotent skip):', outTradeNo)
      } else if (amountTotal !== order.amount) {
        // Amount mismatch → do not mark paid; keep the raw payload for audit.
        console.error('[stripe] notify: amount mismatch | expected:', order.amount, '| got:', amountTotal, '| order:', outTradeNo)
        await db.update(stripeOrders).set({ callbackPayload: webhook as Record<string, unknown>, updatedAt: new Date() })
          .where(eq(stripeOrders.id, order.id))
      } else {
        const [updated] = await db.update(stripeOrders).set({
          status: 'paid',
          transactionId: paymentIntentId,
          sessionId: sessionId || order.sessionId,
          email: email ?? order.email,
          paidAt: new Date(),
          callbackPayload: webhook as Record<string, unknown>,
          updatedAt: new Date()
        }).where(eq(stripeOrders.id, order.id)).returning()
        console.log('[stripe] order paid:', outTradeNo, '| payment_intent:', paymentIntentId)
        void updated
      }
    }
  } else {
    console.log('[stripe] notify: ignored event type', webhook.type ?? '(none)')
  }

  // 3. ACK so Stripe stops retrying
  setResponseStatus(event, 200)
  return { received: true }
})
