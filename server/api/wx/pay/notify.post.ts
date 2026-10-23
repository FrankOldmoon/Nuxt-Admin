import { createError, getHeader, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { verifyWxPayNotifySignature, decryptWxPayResource } from '~~/server/utils/wxPay'
import { fulfilMembershipOrder } from '~~/server/utils/membership'

// POST /api/wx/pay/notify — WeChat Pay v3 async notification (called by WeChat servers, no local auth)
// Flow: verify signature (platform cert) → decrypt resource → validate amount → update order → return {"code":"SUCCESS"}
// Docs: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_5.shtml
export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event)) ?? ''

  // 1. Verify signature (on any failure return 4xx/5xx + FAIL per the WeChat spec)
  const headers = {
    timestamp: getHeader(event, 'wechatpay-timestamp') || '',
    nonce: getHeader(event, 'wechatpay-nonce') || '',
    signature: getHeader(event, 'wechatpay-signature') || '',
    serial: getHeader(event, 'wechatpay-serial') || ''
  }
  if (!headers.timestamp || !headers.signature || !headers.serial) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing Wechatpay-* signature headers' })
  }
  const signatureOk = await verifyWxPayNotifySignature(headers, rawBody)
  if (!signatureOk) {
    console.error('[wxpay] notify signature verification FAILED | serial:', headers.serial)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid notify signature' })
  }

  // 2. Parse + decrypt resource
  const body = JSON.parse(rawBody) as {
    event_type?: string
    resource?: { ciphertext: string, nonce: string, associated_data?: string }
  }
  if (!body.resource?.ciphertext) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing notify resource' })
  }
  const data = await decryptWxPayResource(body.resource) as {
    out_trade_no?: string
    transaction_id?: string
    trade_state?: string
    amount?: { total?: number, payer_total?: number }
  }

  const outTradeNo = data.out_trade_no || ''
  console.log('[wxpay] notify:', body.event_type, '| outTradeNo:', outTradeNo, '| tradeState:', data.trade_state)

  if (!outTradeNo) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing out_trade_no in notify resource' })
  }

  const [order] = await db.select().from(wxPayOrders).where(eq(wxPayOrders.outTradeNo, outTradeNo)).limit(1)
  if (!order) {
    console.error('[wxpay] notify for unknown order:', outTradeNo)
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Unknown out_trade_no' })
  }

  // 3. Payment success: validate the amount matches before persisting (anti-tampering)
  if (body.event_type === 'TRANSACTION.SUCCESS' && data.trade_state === 'SUCCESS') {
    if (data.amount?.total !== order.amount) {
      console.error('[wxpay] notify amount mismatch! expected:', order.amount, '| got:', data.amount?.total)
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Amount mismatch' })
    }
    if (order.status !== 'success') {
      await db.update(wxPayOrders).set({
        status: 'success',
        transactionId: data.transaction_id ?? null,
        paidAt: new Date(),
        callbackPayload: body as unknown as Record<string, unknown>,
        updatedAt: new Date()
      }).where(eq(wxPayOrders.id, order.id))
      console.log('[wxpay] order paid:', outTradeNo, '| transaction:', data.transaction_id)
      // Post-payment fulfilment (membership orders opened by the web or the mini-program)
      await fulfilMembershipOrder({
        bizType: order.bizType,
        bizRefId: order.bizRefId,
        userId: order.userId,
        wxUserId: order.wxUserId,
        outTradeNo: order.outTradeNo,
        amount: order.amount,
        source: 'wechat'
      })
    } else {
      console.log('[wxpay] duplicate notify ignored for:', outTradeNo)
    }
  } else if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(data.trade_state || '')) {
    await db.update(wxPayOrders).set({
      status: 'closed',
      callbackPayload: body as unknown as Record<string, unknown>,
      updatedAt: new Date()
    }).where(eq(wxPayOrders.id, order.id))
  }

  // 4. Acknowledge success per the spec
  setResponseStatus(event, 200)
  return { code: 'SUCCESS', message: '成功' }
})
