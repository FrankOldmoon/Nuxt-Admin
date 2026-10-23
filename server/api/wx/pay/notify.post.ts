import { createError, getHeader, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxPayOrders } from '~~/server/database/schema'
import { verifyWxPayNotifySignature, decryptWxPayResource } from '~~/server/utils/wxPay'

// POST /api/wx/pay/notify — 微信支付 v3 异步通知（微信服务器调用，无本地鉴权）
// 流程：验签（平台证书）→ 解密 resource → 校验金额 → 更新订单 → 返回 {"code":"SUCCESS"}
// 文档: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_5.shtml
export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event)) ?? ''

  // 1. 验签（任何一步失败都按微信规范返回 4xx/5xx + FAIL）
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

  // 2. 解析 + 解密 resource
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

  // 3. 支付成功：校验金额一致再落库（防篡改）
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

  // 4. 按规范应答成功
  setResponseStatus(event, 200)
  return { code: 'SUCCESS', message: '成功' }
})
