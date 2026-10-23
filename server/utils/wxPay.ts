import { createSign, createVerify, createDecipheriv, randomBytes } from 'node:crypto'
import { createError } from 'h3'
import { getConfigValue } from './configs'

// WeChat Pay v3 (JSAPI) 工具层：
// - 商户私钥签名请求（WECHATPAY2-SHA256-RSA2048）
// - 平台证书下载/缓存 + 回调验签
// - 回调 resource 解密（AES-256-GCM, APIv3 key）
// 配置项（dashboard configs）：wx.pay.enabled / wx.pay.mchid / wx.pay.serialNo /
// wx.pay.privateKey(商户 API 私钥 PEM 全文) / wx.pay.apiv3Key / wx.pay.notifyUrl
// 文档: https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_5_1.shtml

const WX_PAY_API = 'https://api.mch.weixin.qq.com'

export interface WxPayConfig {
  appid: string
  mchid: string
  serialNo: string
  privateKey: string
  apiv3Key: string
  notifyUrl: string
}

export async function getWxPayConfig(): Promise<WxPayConfig> {
  const enabled = await getConfigValue<boolean>('wx.pay.enabled', false)
  if (!enabled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'WeChat Pay disabled (set wx.pay.enabled = true in dashboard configs)'
    })
  }
  const appid = await getConfigValue<string>('wx.appid', '')
  const mchid = await getConfigValue<string>('wx.pay.mchid', '')
  const serialNo = await getConfigValue<string>('wx.pay.serialNo', '')
  const privateKey = await getConfigValue<string>('wx.pay.privateKey', '')
  const apiv3Key = await getConfigValue<string>('wx.pay.apiv3Key', '')
  const notifyUrl = await getConfigValue<string>('wx.pay.notifyUrl', '')
  if (!appid || !mchid || !serialNo || !privateKey || !apiv3Key || !notifyUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'Missing WeChat Pay config: wx.pay.mchid / serialNo / privateKey / apiv3Key / notifyUrl'
    })
  }
  if (!privateKey.includes('-----BEGIN')) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'wx.pay.privateKey must be the full merchant API private key PEM (with BEGIN/END lines)'
    })
  }
  return { appid, mchid, serialNo, privateKey, apiv3Key, notifyUrl }
}

// --- merchant signature ---

function signWithMerchantKey(message: string, privateKey: string): string {
  return createSign('RSA-SHA256').update(message).sign(privateKey, 'base64')
}

async function wxPayRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const cfg = await getWxPayConfig()
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(16).toString('hex')
  const bodyStr = body ? JSON.stringify(body) : ''
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyStr}\n`
  const signature = signWithMerchantKey(message, cfg.privateKey)
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serialNo}"`
  return await $fetch<T>(`${WX_PAY_API}${path}`, {
    method,
    ...(body ? { body } : {}),
    headers: {
      'Authorization': authorization,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'nuxt-admin'
    }
  })
}

// --- platform certificates (verify notify signatures) ---

interface PlatformCert { serial: string, cert: string, expiresAt: number }
let platformCertCache: PlatformCert[] | null = null

function aesGcmDecrypt(ciphertextB64: string, key: Buffer, nonce: string, aad: string): string {
  const buf = Buffer.from(ciphertextB64, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(aad))
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

async function downloadPlatformCertificates(): Promise<PlatformCert[]> {
  const cfg = await getWxPayConfig()
  const res = await wxPayRequest<{ data?: Array<{
    serial_no: string
    expire_time: string
    encrypt_certificate: { algorithm: string, nonce: string, associated_data: string, ciphertext: string }
  }> }>('GET', '/v3/certificates')
  if (!res.data?.length) {
    console.error('[wxpay] download platform certificates failed:', res)
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway', message: 'WeChat Pay: failed to download platform certificates' })
  }
  const key = Buffer.from(cfg.apiv3Key, 'utf8')
  const certs: PlatformCert[] = []
  for (const item of res.data) {
    try {
      const pem = aesGcmDecrypt(item.encrypt_certificate.ciphertext, key, item.encrypt_certificate.nonce, item.encrypt_certificate.associated_data)
      certs.push({
        serial: item.serial_no,
        cert: pem, // X.509 PEM text
        expiresAt: new Date(item.expire_time).getTime() || Date.now() + 24 * 3600 * 1000
      })
    } catch (e) {
      console.error('[wxpay] decrypt platform certificate failed (serial', item.serial_no, '):', e)
    }
  }
  console.log('[wxpay] platform certificates downloaded:', certs.length)
  return certs
}

async function getPlatformCertificates(): Promise<PlatformCert[]> {
  if (platformCertCache && platformCertCache.every(c => c.expiresAt > Date.now())) {
    return platformCertCache
  }
  platformCertCache = await downloadPlatformCertificates()
  return platformCertCache
}

// --- notify verify + decrypt ---

export interface WxPayNotifyHeaders {
  timestamp: string
  nonce: string
  signature: string
  serial: string
}

/** Verify the Wechatpay-* signature headers against the raw request body. */
export async function verifyWxPayNotifySignature(headers: WxPayNotifyHeaders, rawBody: string): Promise<boolean> {
  const message = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`
  const certs = await getPlatformCertificates()
  const cert = certs.find(c => c.serial === headers.serial)
  if (!cert) {
    console.error('[wxpay] notify signature: unknown serial', headers.serial, '| known:', certs.map(c => c.serial))
    return false
  }
  return createVerify('RSA-SHA256').update(message).verify(cert.cert, headers.signature, 'base64')
}

/** Decrypt the notify `resource` field (AES-256-GCM with the APIv3 key). */
export async function decryptWxPayResource(resource: { ciphertext: string, nonce: string, associated_data?: string }): Promise<Record<string, unknown>> {
  const apiv3Key = await getConfigValue<string>('wx.pay.apiv3Key', '')
  if (!apiv3Key) throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Missing config: wx.pay.apiv3Key' })
  const key = Buffer.from(apiv3Key, 'utf8')
  return JSON.parse(aesGcmDecrypt(resource.ciphertext, key, resource.nonce, resource.associated_data || ''))
}

// --- JSAPI order ---

export interface JsapiOrderResult {
  prepayId: string
  payment: {
    timeStamp: string
    nonceStr: string
    package: string
    signType: 'RSA'
    paySign: string
  }
}

/** Create a JSAPI order and build the wx.requestPayment parameters. */
export async function createJsapiOrder(params: {
  openid: string
  outTradeNo: string
  description: string
  amountFen: number
}): Promise<JsapiOrderResult> {
  const cfg = await getWxPayConfig()
  const res = await wxPayRequest<{ prepay_id?: string, code?: string, message?: string }>(
    'POST',
    '/v3/pay/transactions/jsapi',
    {
      appid: cfg.appid,
      mchid: cfg.mchid,
      description: params.description,
      out_trade_no: params.outTradeNo,
      notify_url: cfg.notifyUrl,
      amount: { total: params.amountFen, currency: 'CNY' },
      payer: { openid: params.openid }
    }
  )
  if (!res.prepay_id) {
    console.error('[wxpay] jsapi order failed:', res)
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `WeChat Pay order error: ${res.message ?? 'unknown'}`
    })
  }

  // 二次签名：小程序端 wx.requestPayment 所需参数
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = randomBytes(16).toString('hex')
  const pkg = `prepay_id=${res.prepay_id}`
  const paySign = signWithMerchantKey(`${cfg.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`, cfg.privateKey)
  return { prepayId: res.prepay_id, payment: { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign } }
}

// --- query order (对账/回调丢失兜底) ---

export async function queryWxPayOrderByOutTradeNo(outTradeNo: string): Promise<{
  tradeState?: string
  transactionId?: string
  raw: Record<string, unknown>
}> {
  const cfg = await getWxPayConfig()
  const res = await wxPayRequest<Record<string, unknown>>(
    'GET',
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${cfg.mchid}`
  )
  return {
    tradeState: res.trade_state as string | undefined,
    transactionId: res.transaction_id as string | undefined,
    raw: res
  }
}
