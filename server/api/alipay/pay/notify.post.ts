import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { alipayOrders } from '~~/server/database/schema'
import { getAlipayConfig, parseAlipayNotifyBody, verifyAlipaySignature, fenToYuan } from '~~/server/utils/alipay'
import { fulfilMembershipOrder } from '~~/server/utils/membership'
import { fulfilCreditOrder } from '~~/server/utils/credits'

// POST /api/alipay/pay/notify — Alipay asynchronous notify callback.
//
// Alipay retries until the response body is exactly `success`, so every branch
// that has nothing left to do must still answer `success`; only signature or
// amount mismatches answer `failure` (which keeps the retry going and surfaces
// the problem in the Alipay console).
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')

  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const params = parseAlipayNotifyBody(raw)

  let cfg
  try {
    cfg = await getAlipayConfig()
  } catch (e) {
    console.error('[alipay] notify received while Alipay is disabled:', e)
    return 'failure'
  }

  if (!verifyAlipaySignature(params, cfg.publicKey)) {
    console.warn('[alipay] notify signature verification failed | out_trade_no:', params.out_trade_no)
    return 'failure'
  }
  if (params.app_id && params.app_id !== cfg.appId) {
    console.warn('[alipay] notify app_id mismatch | got:', params.app_id)
    return 'failure'
  }

  const outTradeNo = params.out_trade_no
  if (!outTradeNo) return 'success'

  const [order] = await db.select().from(alipayOrders)
    .where(eq(alipayOrders.outTradeNo, outTradeNo))
    .limit(1)
  if (!order) {
    console.error('[alipay] notify for unknown order:', outTradeNo)
    return 'success'
  }

  const tradeStatus = params.trade_status ?? ''
  if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
    console.log('[alipay] notify ignored | order:', outTradeNo, '| status:', tradeStatus)
    return 'success'
  }

  // Idempotency: Alipay may deliver the same notification more than once
  if (order.status === 'success') return 'success'

  // Amount check: the callback must match what we asked for
  if (params.total_amount && params.total_amount !== fenToYuan(order.amount)) {
    console.error('[alipay] notify amount mismatch | order:', outTradeNo, '| expected:', fenToYuan(order.amount), '| got:', params.total_amount)
    return 'failure'
  }

  const [updated] = await db.update(alipayOrders).set({
    status: 'success',
    tradeNo: params.trade_no ?? order.tradeNo,
    paidAt: new Date(),
    callbackPayload: params,
    updatedAt: new Date()
  }).where(eq(alipayOrders.id, order.id)).returning()
  void updated
  console.log('[alipay] order paid:', outTradeNo, '| trade_no:', params.trade_no)

  await fulfilMembershipOrder({
    bizType: order.bizType,
    bizRefId: order.bizRefId,
    userId: order.userId,
    outTradeNo: order.outTradeNo,
    amount: order.amount,
    source: 'alipay'
  })

  // Credit top-ups use the same order table with bizType='credits'.
  await fulfilCreditOrder({
    bizType: order.bizType,
    bizRefId: order.bizRefId,
    userId: order.userId,
    outTradeNo: order.outTradeNo
  })

  return 'success'
})
