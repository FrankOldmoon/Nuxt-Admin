import { createError, getQuery } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { queryWxPayOrderByOutTradeNo } from '~~/server/utils/wxPay'
import { fulfilMembershipOrder, getActiveMembership } from '~~/server/utils/membership'

// GET /api/wx/membership/order?outTradeNo=xxx — poll a mini-program membership order.
// Auth: wx token. Falls back to an active query when the notify callback is lost.
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

  let status = order.status
  if (status === 'pending') {
    try {
      const remote = await queryWxPayOrderByOutTradeNo(outTradeNo)
      if (remote.tradeState === 'SUCCESS') {
        await db.update(wxPayOrders).set({
          status: 'success',
          transactionId: remote.transactionId ?? order.transactionId,
          paidAt: new Date(),
          updatedAt: new Date()
        }).where(eq(wxPayOrders.id, order.id))
        status = 'success'
        await fulfilMembershipOrder({
          bizType: order.bizType,
          bizRefId: order.bizRefId,
          userId: order.userId,
          wxUserId: order.wxUserId,
          outTradeNo: order.outTradeNo,
          amount: order.amount,
          source: 'wechat'
        })
        console.log('[membership] wx jsapi order synced to success via query:', outTradeNo)
      } else if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(remote.tradeState || '')) {
        await db.update(wxPayOrders).set({ status: 'closed', updatedAt: new Date() })
          .where(eq(wxPayOrders.id, order.id))
        status = 'closed'
      }
    } catch (e) {
      console.warn('[membership] wx jsapi order query failed (returning local state):', e)
    }
  }

  const active = await getActiveMembership({ wxUserId: wxUser.id })
  return { status, isMember: active !== null, expiresAt: active?.subscription.expiresAt ?? null }
})
