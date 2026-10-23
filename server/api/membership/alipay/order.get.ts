import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { alipayOrders } from '~~/server/database/schema'
import { queryAlipayOrderByOutTradeNo } from '~~/server/utils/alipay'
import { fulfilMembershipOrder, getActiveMembership } from '~~/server/utils/membership'

// GET /api/membership/alipay/order?outTradeNo=xxx — poll a membership Alipay order.
// While pending, actively query Alipay to sync the final state (fallback for a
// lost notify). On success the membership period is activated exactly once.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)

  const outTradeNo = getQuery(event).outTradeNo?.toString().trim()
  if (!outTradeNo) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'outTradeNo is required' })
  }

  const [order] = await db.select().from(alipayOrders)
    .where(and(eq(alipayOrders.outTradeNo, outTradeNo), eq(alipayOrders.userId, auth.user.id)))
    .limit(1)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Order not found' })
  }

  let status = order.status
  if (status === 'pending') {
    try {
      const remote = await queryAlipayOrderByOutTradeNo(outTradeNo)
      if (remote.tradeStatus === 'TRADE_SUCCESS' || remote.tradeStatus === 'TRADE_FINISHED') {
        await db.update(alipayOrders).set({
          status: 'success',
          tradeNo: remote.tradeNo ?? order.tradeNo,
          paidAt: new Date(),
          updatedAt: new Date()
        }).where(eq(alipayOrders.id, order.id))
        status = 'success'
        await fulfilMembershipOrder({
          bizType: order.bizType,
          bizRefId: order.bizRefId,
          userId: order.userId,
          outTradeNo: order.outTradeNo,
          amount: order.amount,
          source: 'alipay'
        })
        console.log('[membership] alipay order synced to success via query:', outTradeNo)
      } else if (remote.tradeStatus === 'TRADE_CLOSED') {
        await db.update(alipayOrders).set({ status: 'closed', updatedAt: new Date() })
          .where(eq(alipayOrders.id, order.id))
        status = 'closed'
      }
    } catch (e) {
      console.warn('[membership] alipay order query failed (returning local state):', e)
    }
  }

  const active = await getActiveMembership({ userId: auth.user.id })
  return { status, isMember: active !== null, expiresAt: active?.subscription.expiresAt ?? null }
})
