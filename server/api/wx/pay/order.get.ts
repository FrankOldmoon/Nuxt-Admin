import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { queryWxPayOrderByOutTradeNo } from '~~/server/utils/wxPay'

// GET /api/wx/pay/order?outTradeNo=xxx — Query a pay order (own orders only)
// For locally pending orders, actively query WeChat to sync the status (fallback for lost callbacks)
export default defineEventHandler(async (event) => {
  const wxUser = await requireWxUser(event)

  const outTradeNo = getQuery(event).outTradeNo?.toString().trim()
  if (!outTradeNo) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'outTradeNo is required' })
  }

  const [order] = await db.select().from(wxPayOrders)
    .where(and(eq(wxPayOrders.outTradeNo, outTradeNo), eq(wxPayOrders.wxUserId, wxUser.id)))
    .limit(1)
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Order not found' })
  }

  // For pending orders, actively query WeChat to sync the final status
  if (order.status === 'pending') {
    try {
      const remote = await queryWxPayOrderByOutTradeNo(outTradeNo)
      if (remote.tradeState === 'SUCCESS') {
        const [updated] = await db.update(wxPayOrders).set({
          status: 'success',
          transactionId: remote.transactionId ?? null,
          paidAt: new Date(),
          updatedAt: new Date()
        }).where(eq(wxPayOrders.id, order.id)).returning()
        console.log('[wxpay] order synced to success via query:', outTradeNo)
        return { order: updated ?? order, tradeState: remote.tradeState }
      }
      if (remote.tradeState === 'CLOSED' || remote.tradeState === 'REVOKED' || remote.tradeState === 'PAYERROR') {
        const [updated] = await db.update(wxPayOrders).set({ status: 'closed', updatedAt: new Date() })
          .where(eq(wxPayOrders.id, order.id)).returning()
        return { order: updated ?? order, tradeState: remote.tradeState }
      }
      return { order, tradeState: remote.tradeState }
    } catch (e) {
      console.warn('[wxpay] remote query failed (returning local state):', e)
    }
  }

  return { order, tradeState: order.status === 'success' ? 'SUCCESS' : order.status.toUpperCase() }
})
