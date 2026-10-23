import { createError, getQuery } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { queryWxPayOrderByOutTradeNo } from '~~/server/utils/wxPay'
import { fulfilMembershipOrder, getActiveMembership } from '~~/server/utils/membership'

// GET /api/membership/wechat/order?outTradeNo=xxx — poll a website WeChat order.
// While pending, actively query WeChat to sync the final state (fallback for a
// lost notify). On success the membership period is activated exactly once.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)

  const outTradeNo = getQuery(event).outTradeNo?.toString().trim()
  if (!outTradeNo) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'outTradeNo is required' })
  }

  const [order] = await db.select().from(wxPayOrders)
    .where(and(eq(wxPayOrders.outTradeNo, outTradeNo), eq(wxPayOrders.userId, auth.user.id)))
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
        console.log('[membership] wechat order synced to success via query:', outTradeNo)
      } else if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(remote.tradeState || '')) {
        await db.update(wxPayOrders).set({ status: 'closed', updatedAt: new Date() })
          .where(eq(wxPayOrders.id, order.id))
        status = 'closed'
      }
    } catch (e) {
      console.warn('[membership] wechat order query failed (returning local state):', e)
    }
  }

  const active = await getActiveMembership({ userId: auth.user.id })
  return { status, isMember: active !== null, expiresAt: active?.subscription.expiresAt ?? null }
})
