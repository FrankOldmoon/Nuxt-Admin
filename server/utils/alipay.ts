import { createSign, createVerify } from 'node:crypto'
import { createError } from 'h3'
import { ofetch } from 'ofetch'
import { getConfigValue } from './configs'

// Alipay OpenAPI utility layer (RSA2 signing, no SDK dependency):
// - Signs requests with the app private key (SHA256withRSA)
// - Builds `alipay.trade.page.pay` redirect URLs (PC cashier, web only)
// - Verifies async notify signatures with the Alipay public key
// - Queries orders (`alipay.trade.query`) for reconciliation
// Config (dashboard configs): alipay.enabled / alipay.appId / alipay.privateKey /
// alipay.publicKey / alipay.gateway / alipay.notifyUrl / alipay.returnUrl
// Docs: https://opendocs.alipay.com/open/270/105898

const DEFAULT_GATEWAY = 'https://openapi.alipay.com/gateway.do'
// Alipay amounts are decimal yuan, while our orders store cents (fen)
const FEN_PER_YUAN = 100

export interface AlipayConfig {
  appId: string
  privateKey: string
  publicKey: string
  gateway: string
  notifyUrl: string
  returnUrl: string
  signType: 'RSA2'
}

/** Non-throwing check: is Alipay switched on and are the keys present? */
export async function isAlipayEnabled(): Promise<boolean> {
  const enabled = await getConfigValue<boolean>('alipay.enabled', false)
  if (!enabled) return false
  const appId = (await getConfigValue<string>('alipay.appId', '')).trim()
  const privateKey = (await getConfigValue<string>('alipay.privateKey', '')).trim()
  return !!appId && !!privateKey
}

/** Load Alipay config; throws 409 when the switch is off. */
export async function getAlipayConfig(): Promise<AlipayConfig> {
  const enabled = await getConfigValue<boolean>('alipay.enabled', false)
  if (!enabled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Alipay disabled (set alipay.enabled = true in dashboard configs)'
    })
  }
  const appId = (await getConfigValue<string>('alipay.appId', '')).trim()
  const privateKey = (await getConfigValue<string>('alipay.privateKey', '')).trim()
  const publicKey = (await getConfigValue<string>('alipay.publicKey', '')).trim()
  const gateway = ((await getConfigValue<string>('alipay.gateway', DEFAULT_GATEWAY)).trim() || DEFAULT_GATEWAY).replace(/\/$/, '')
  const notifyUrl = (await getConfigValue<string>('alipay.notifyUrl', '')).trim()
  const returnUrl = (await getConfigValue<string>('alipay.returnUrl', '')).trim()
  if (!appId || !privateKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'Missing Alipay config: alipay.appId / alipay.privateKey'
    })
  }
  return { appId, privateKey, publicKey, gateway, notifyUrl, returnUrl, signType: 'RSA2' }
}

// --- keys & signatures ---

/**
 * Alipay console hands out keys either as bare base64 (no PEM header) or as a
 * complete PEM block. Node's crypto only accepts the latter, so wrap bare keys.
 */
function normalizePem(key: string, type: 'PRIVATE' | 'PUBLIC'): string {
  const trimmed = key.trim().replace(/\\n/g, '\n')
  if (trimmed.includes('-----BEGIN')) return trimmed
  const body = trimmed.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? trimmed
  return type === 'PRIVATE'
    ? `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`
    : `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`
}

/**
 * Alipay signature content: sorted k=v pairs, skipping empty values.
 *
 * - Request signing excludes only `sign` (sign_type participates).
 * - Notify/response verification excludes both `sign` and `sign_type`.
 */
export function buildAlipaySignContent(
  params: Record<string, string | undefined>,
  forVerify = false
): string {
  return Object.keys(params)
    .filter(k => k !== 'sign' && !(forVerify && k === 'sign_type') && params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
}

function signWithAppKey(content: string, privateKey: string): string {
  return createSign('RSA-SHA256').update(content, 'utf8').sign(normalizePem(privateKey, 'PRIVATE'), 'base64')
}

/** Verify an Alipay signature (notify body or gateway response) with the public key. */
export function verifyAlipaySignature(
  params: Record<string, string | undefined>,
  publicKey: string
): boolean {
  const sign = params.sign
  if (!sign || !publicKey) return false
  try {
    return createVerify('RSA-SHA256')
      .update(buildAlipaySignContent(params, true), 'utf8')
      .verify(normalizePem(publicKey, 'PUBLIC'), sign, 'base64')
  } catch (e) {
    console.error('[alipay] signature verification error:', e)
    return false
  }
}

/** Alipay expects timestamp in Asia/Shanghai: yyyy-MM-dd HH:mm:ss */
function alipayTimestamp(): string {
  const china = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return china.toISOString().replace('T', ' ').slice(0, 19)
}

/** Convert an order amount in cents (fen) to the yuan string Alipay expects. */
export function fenToYuan(amount: number): string {
  return (amount / FEN_PER_YUAN).toFixed(2)
}

// --- page pay (web cashier redirect) ---

export interface AlipayPayParams {
  outTradeNo: string
  subject: string
  amountFen: number
  /** Absolute URL Alipay redirects the browser to after payment */
  returnUrl?: string
  /** Absolute URL Alipay calls server-to-server with the payment result */
  notifyUrl?: string
  /** Payment timeout, e.g. '30m' (optional) */
  timeoutExpress?: string
}

/**
 * Build a signed `alipay.trade.page.pay` URL. Redirecting the browser to it
 * opens the Alipay cashier; the actual payment result arrives through the
 * notify callback (or through `queryAlipayOrder` when the callback is lost).
 */
export async function buildAlipayPagePayUrl(params: AlipayPayParams): Promise<string> {
  const cfg = await getAlipayConfig()
  const bizContent: Record<string, string> = {
    out_trade_no: params.outTradeNo,
    total_amount: fenToYuan(params.amountFen),
    subject: params.subject.slice(0, 256),
    product_code: 'FAST_INSTANT_TRADE_PAY'
  }
  if (params.timeoutExpress) bizContent.timeout_express = params.timeoutExpress

  const common: Record<string, string> = {
    app_id: cfg.appId,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: cfg.signType,
    timestamp: alipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent)
  }
  if (params.notifyUrl || cfg.notifyUrl) common.notify_url = params.notifyUrl || cfg.notifyUrl
  if (params.returnUrl || cfg.returnUrl) common.return_url = params.returnUrl || cfg.returnUrl

  const sign = signWithAppKey(buildAlipaySignContent(common), cfg.privateKey)
  const query = new URLSearchParams({ ...common, sign })
  return `${cfg.gateway}?${query.toString()}`
}

// --- trade query (reconciliation) ---

export interface AlipayQueryResult {
  /** Alipay trade_status: WAIT_BUYER_PAY | TRADE_SUCCESS | TRADE_FINISHED | TRADE_CLOSED */
  tradeStatus?: string
  tradeNo?: string
  /** total_amount returned by Alipay, in decimal yuan */
  totalAmount?: string
  raw: Record<string, unknown>
}

/** Query an order by merchant order number (fallback for lost notify callbacks). */
export async function queryAlipayOrderByOutTradeNo(outTradeNo: string): Promise<AlipayQueryResult> {
  const cfg = await getAlipayConfig()
  const common: Record<string, string> = {
    app_id: cfg.appId,
    method: 'alipay.trade.query',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: cfg.signType,
    timestamp: alipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify({ out_trade_no: outTradeNo })
  }
  const sign = signWithAppKey(buildAlipaySignContent(common), cfg.privateKey)

  const res = await ofetch<Record<string, Record<string, unknown>>>(
    `${cfg.gateway}?charset=utf-8`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({ ...common, sign }).toString()
    }
  )
  const body = res?.alipay_trade_query_response ?? {}
  // Business errors are returned with code != 10000 (e.g. order not exist)
  if (body.code && body.code !== '10000') {
    console.warn('[alipay] trade query returned:', body.code, body.sub_code ?? '', body.sub_msg ?? '')
  }
  return {
    tradeStatus: body.trade_status as string | undefined,
    tradeNo: body.trade_no as string | undefined,
    totalAmount: body.total_amount as string | undefined,
    raw: body
  }
}

/** Parse a form-encoded Alipay notify body into a flat string map. */
export function parseAlipayNotifyBody(raw: string): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value
  return params
}
