import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'
import { getConfigValue } from './configs'

// Stripe Checkout utility layer (REST API, no SDK dependency):
// - Creates Checkout Sessions (hosted payment page) for a one-time payment
// - Verifies webhook signatures (Stripe-Signature: t=...,v1=...)
// - Retrieves a session for reconciliation when callbacks are lost
// Config (dashboard configs): stripe.enabled / stripe.secretKey /
// stripe.webhookSecret / stripe.currency / stripe.successUrl / stripe.cancelUrl
// Docs: https://docs.stripe.com/api/checkout/sessions/create

const STRIPE_API = 'https://api.stripe.com'

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  currency: string
  successUrl: string
  cancelUrl: string
}

/** Non-throwing check: is Stripe switched on and is the secret key present? */
export async function isStripeEnabled(): Promise<boolean> {
  const enabled = await getConfigValue<boolean>('stripe.enabled', false)
  if (!enabled) return false
  return !!(await getConfigValue<string>('stripe.secretKey', ''))?.trim()
}

/** Load Stripe config; throws 409 when the payment switch is off. */
export async function getStripeConfig(): Promise<StripeConfig> {
  const enabled = await getConfigValue<boolean>('stripe.enabled', false)
  if (!enabled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Stripe disabled (set stripe.enabled = true in dashboard configs)'
    })
  }
  const secretKey = (await getConfigValue<string>('stripe.secretKey', '')).trim()
  const webhookSecret = (await getConfigValue<string>('stripe.webhookSecret', '')).trim()
  const currency = ((await getConfigValue<string>('stripe.currency', 'usd')).trim() || 'usd').toLowerCase()
  const successUrl = (await getConfigValue<string>('stripe.successUrl', '/')).trim() || '/'
  const cancelUrl = (await getConfigValue<string>('stripe.cancelUrl', '/')).trim() || '/'
  if (!secretKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'Missing Stripe config: stripe.secretKey'
    })
  }
  return { secretKey, webhookSecret, currency, successUrl, cancelUrl }
}

// --- checkout session ---

export interface StripeCheckoutResult {
  sessionId: string
  url: string
}

/** Create a hosted Checkout Session for a one-time payment. */
export async function createCheckoutSession(params: {
  outTradeNo: string
  description: string
  amountCents: number
  currency: string
  customerEmail?: string | null
  successUrl: string
  cancelUrl: string
  secretKey: string
  /** Extra metadata propagated back in the webhook (e.g. bizType / planId / userId) */
  metadata?: Record<string, string | number | null | undefined>
}): Promise<StripeCheckoutResult> {
  const form = new URLSearchParams({
    'mode': 'payment',
    'client_reference_id': params.outTradeNo,
    'metadata[out_trade_no]': params.outTradeNo,
    'success_url': params.successUrl,
    'cancel_url': params.cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': params.currency,
    'line_items[0][price_data][unit_amount]': String(params.amountCents),
    'line_items[0][price_data][product_data][name]': params.description.slice(0, 250)
  })
  // Stripe metadata values are strings capped at 500 chars
  for (const [key, value] of Object.entries(params.metadata ?? {})) {
    if (value === null || value === undefined || value === '') continue
    form.set(`metadata[${key}]`, String(value).slice(0, 500))
  }
  if (params.customerEmail) form.set('customer_email', params.customerEmail)

  type StripeRequestError = { data?: { error?: { message?: string } }, message?: string }
  const res = await $fetch<{ id: string, url: string }>(`${STRIPE_API}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  }).catch((e: StripeRequestError) => {
    const message = e?.data?.error?.message ?? e?.message ?? 'unknown error'
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `Stripe checkout session error: ${message}`
    })
  })
  if (!res?.id || !res?.url) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: 'Stripe checkout session error: missing id/url in response'
    })
  }
  return { sessionId: res.id, url: res.url }
}

// --- webhook signature verification ---

/**
 * Verify the `Stripe-Signature` header against the raw request body.
 * Scheme: HMAC-SHA256 over `${timestamp}.${payload}`, compared to every v1
 * entry with a constant-time comparison; the timestamp must be recent.
 */
export function verifyStripeWebhookSignature(
  signatureHeader: string,
  rawBody: string,
  webhookSecret: string,
  toleranceSeconds = 300
): boolean {
  if (!signatureHeader || !webhookSecret) return false
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const idx = kv.indexOf('=')
      return idx === -1 ? [kv.trim(), ''] : [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()]
    })
  )
  const timestamp = parts.t ?? ''
  const signatures = (parts.v1 ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!timestamp || signatures.length === 0) return false

  const ts = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false

  const expected = createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex')
  return signatures.some(sig =>
    sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
}

// --- session retrieve (reconciliation / fallback for lost callbacks) ---

export interface StripeSessionInfo {
  paymentStatus?: string // paid | unpaid
  paymentIntentId?: string
  amountTotal?: number
  currency?: string
  raw: Record<string, unknown>
}

/** Retrieve a Checkout Session by id to check its payment status. */
export async function retrieveStripeSession(sessionId: string, secretKey: string): Promise<StripeSessionInfo> {
  type StripeRequestError = { data?: { error?: { message?: string } }, message?: string }
  const res = await $fetch<Record<string, unknown>>(`${STRIPE_API}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  }).catch((e: StripeRequestError) => {
    const message = e?.data?.error?.message ?? e?.message ?? 'unknown error'
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `Stripe session retrieve error: ${message}`
    })
  })
  return {
    paymentStatus: res.payment_status as string | undefined,
    paymentIntentId: res.payment_intent as string | undefined,
    amountTotal: res.amount_total as number | undefined,
    currency: res.currency as string | undefined,
    raw: res
  }
}
