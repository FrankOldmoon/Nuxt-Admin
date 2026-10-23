import { createError, getQuery } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { stripeOrders } from '~~/server/database/schema'
import { getStripeConfig, retrieveStripeSession } from '~~/server/utils/stripe'
import { activateMembership } from '~~/server/utils/membership'

// GET /api/stripe/pay/order?outTradeNo=xxx — query a Stripe order (own orders only)
// For locally pending orders, actively retrieve the session to sync the status
// (fallback for lost webhooks).
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)

  const outTradeNo = getQuery(event).outTradeNo?.toString().trim()
  if (!outTradeNo) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'outTradeNo is required' })
  }

  const [order] = await db.select().from(stripeOrders)
    .where(eq(stripeOrders.outTradeNo, outTradeNo))
    .limit(1)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Order not found' })
  }
  // Own orders only (admins may inspect any order)
  if (order.userId !== auth.user.id && auth.role?.name !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Not your order' })
  }

  // For pending orders with a session id, actively query Stripe to sync the final status
  if (order.status === 'pending' && order.sessionId) {
    try {
      const cfg = await getStripeConfig()
      const remote = await retrieveStripeSession(order.sessionId, cfg.secretKey)
      if (remote.paymentStatus === 'paid') {
        const [updated] = await db.update(stripeOrders).set({
          status: 'paid',
          transactionId: remote.paymentIntentId ?? order.transactionId,
          paidAt: new Date(),
          updatedAt: new Date()
        }).where(eq(stripeOrders.id, order.id)).returning()
        console.log('[stripe] order synced to paid via session retrieve:', outTradeNo)
        // Post-payment fulfilment: activate the membership period for membership orders
        if (order.bizType === 'membership' && order.userId && order.bizRefId) {
          try {
            await activateMembership({
              userId: order.userId,
              planId: order.bizRefId,
              source: 'stripe',
              outTradeNo: order.outTradeNo,
              amountCents: order.amount
            })
          } catch (e) {
            console.error('[stripe] membership activation failed (reconciliation) | order:', outTradeNo, e)
          }
        }
        return { order: updated ?? order, paymentStatus: remote.paymentStatus }
      }
      return { order, paymentStatus: remote.paymentStatus }
    } catch (e) {
      console.warn('[stripe] remote session retrieve failed (returning local state):', e)
    }
  }

  return { order, paymentStatus: order.status === 'paid' ? 'paid' : order.status }
})
