import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { alipayOrders } from '~~/server/database/schema'
import { queryAlipayOrderByOutTradeNo } from '~~/server/utils/alipay'

// GET /api/alipay/pay/order?outTradeNo=xxx — Query a pay order (own orders only).
// Pending orders are actively re-queried against Alipay (fallback for lost callbacks).
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

  if (order.status === 'pending') {
    try {
      const remote = await queryAlipayOrderByOutTradeNo(outTradeNo)
      if (remote.tradeStatus === 'TRADE_SUCCESS' || remote.tradeStatus === 'TRADE_FINISHED') {
        const [updated] = await db.update(alipayOrders).set({
          status: 'success',
          tradeNo: remote.tradeNo ?? order.tradeNo,
          paidAt: new Date(),
          updatedAt: new Date()
        }).where(eq(alipayOrders.id, order.id)).returning()
        console.log('[alipay] order synced to success via query:', outTradeNo)
        return { order: updated ?? order, tradeStatus: remote.tradeStatus }
      }
      if (remote.tradeStatus === 'TRADE_CLOSED') {
        const [updated] = await db.update(alipayOrders).set({ status: 'closed', updatedAt: new Date() })
          .where(eq(alipayOrders.id, order.id)).returning()
        return { order: updated ?? order, tradeStatus: remote.tradeStatus }
      }
      return { order, tradeStatus: remote.tradeStatus }
    } catch (e) {
      console.warn('[alipay] remote query failed (returning local state):', e)
    }
  }

  return { order, tradeStatus: order.status === 'success' ? 'TRADE_SUCCESS' : order.status.toUpperCase() }
})
