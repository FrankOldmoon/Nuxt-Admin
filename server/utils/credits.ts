import { desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { PoolClient } from 'pg'
import { db, pool } from './db'
import { creditTransactions } from '../database/schema'
import { getConfigValue } from './configs'
import { userIsMember } from './membership'

/**
 * Credit ledger helpers, shared by every module that meters usage.
 *
 * Balance is derived from the ledger (`SUM(amount)`), never cached, so an
 * admin grant, a refund and a consume can never disagree. Writes take a
 * per-user advisory lock inside a transaction, which keeps concurrent runs
 * from spending the same credits twice.
 */
export type CreditKind = 'grant' | 'purchase' | 'spend' | 'refund' | 'adjust'

export interface CreditHistoryRow {
  id: number
  amount: number
  kind: string
  feature: string
  note: string
  createdAt: Date
}

const MAX_GRANT = 100_000

function assertAmount(amount: number, label = 'amount'): number {
  const value = Math.floor(Number(amount))
  if (!Number.isFinite(value) || value === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `${label} must be a non-zero integer` })
  }
  if (Math.abs(value) > MAX_GRANT) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `${label} is too large` })
  }
  return value
}

async function withUserLock<T>(
  userId: number,
  work: (client: PoolClient, balance: number) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`credits:${userId}`])
    const { rows } = await client.query<{ balance: number }>(
      'SELECT COALESCE(SUM(amount), 0)::int AS balance FROM credit_transactions WHERE user_id = $1',
      [userId]
    )
    const result = await work(client, Number(rows[0]?.balance ?? 0))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function getCreditBalance(userId: number): Promise<number> {
  const result = await pool.query<{ balance: number }>(
    'SELECT COALESCE(SUM(amount), 0)::int AS balance FROM credit_transactions WHERE user_id = $1',
    [userId]
  )
  return Number(result.rows[0]?.balance ?? 0)
}

export async function getCreditHistory(userId: number, limit = 20): Promise<CreditHistoryRow[]> {
  return db
    .select({
      id: creditTransactions.id,
      amount: creditTransactions.amount,
      kind: creditTransactions.kind,
      feature: creditTransactions.feature,
      note: creditTransactions.note,
      createdAt: creditTransactions.createdAt
    })
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id))
    .limit(limit)
}

export interface SpendResult {
  ok: boolean
  balance: number
  transactionId?: number
  spent?: number
}

/** Consume credits for one feature run. Returns `ok: false` when short. */
export async function spendCredits(input: {
  userId: number
  amount: number
  feature: string
  note?: string
}): Promise<SpendResult> {
  const amount = Math.abs(assertAmount(input.amount))
  const feature = (input.feature || '').slice(0, 80)
  return withUserLock(input.userId, async (client, balance) => {
    if (balance < amount) return { ok: false, balance }
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO credit_transactions (user_id, amount, kind, feature, note)
       VALUES ($1, $2, 'spend', $3, $4) RETURNING id`,
      [input.userId, -amount, feature, (input.note ?? '').slice(0, 255)]
    )
    return { ok: true, balance: balance - amount, transactionId: rows[0]!.id, spent: amount }
  })
}

/**
 * Reverse a spend once. Safe to call twice: the unique `ref_id` index plus the
 * in-lock check make the second call a no-op.
 */
export async function refundCredits(input: {
  userId: number
  transactionId: number
  note?: string
}): Promise<{ ok: boolean, refunded: boolean, balance: number }> {
  return withUserLock(input.userId, async (client, balance) => {
    const original = await client.query<{ amount: number, kind: string, feature: string }>(
      'SELECT amount, kind, feature FROM credit_transactions WHERE id = $1 AND user_id = $2',
      [input.transactionId, input.userId]
    )
    const row = original.rows[0]
    if (!row || row.kind !== 'spend') return { ok: false, refunded: false, balance }

    const already = await client.query('SELECT 1 FROM credit_transactions WHERE ref_id = $1', [input.transactionId])
    if ((already.rowCount ?? 0) > 0) return { ok: true, refunded: false, balance }

    const amount = Math.abs(Number(row.amount))
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, kind, feature, note, ref_id)
       VALUES ($1, $2, 'refund', $3, $4, $5)`,
      [input.userId, amount, row.feature, (input.note ?? '').slice(0, 255), input.transactionId]
    )
    return { ok: true, refunded: true, balance: balance + amount }
  })
}

/** Admin grant / manual adjustment (amount may be negative for a correction). */
export async function grantCredits(input: {
  userId: number
  amount: number
  note?: string
  operatorId?: number | null
  kind?: Extract<CreditKind, 'grant' | 'adjust'>
}): Promise<{ balance: number, transactionId: number }> {
  const amount = assertAmount(input.amount)
  const kind = input.kind ?? 'grant'
  return withUserLock(input.userId, async (client, balance) => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO credit_transactions (user_id, amount, kind, feature, note, operator_id)
       VALUES ($1, $2, $3, '', $4, $5) RETURNING id`,
      [input.userId, amount, kind, (input.note ?? '').slice(0, 255), input.operatorId ?? null]
    )
    return { balance: balance + amount, transactionId: rows[0]!.id }
  })
}

/* ------------------------------------------------------------ self-service */

export interface CreditPackage {
  /** Stable numeric id; stored on the payment order as `bizRefId`. */
  id: number
  credits: number
  /** Price in cents/fen. */
  priceCents: number
  title: { en: string, zh: string }
  note: { en: string, zh: string }
}

/**
 * Default self-serve top-up packs. Override with the `credits.packages` config
 * (JSON array of the same shape) — the dashboard can edit it without a deploy.
 */
export const DEFAULT_CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 1,
    credits: 100,
    priceCents: 1000,
    title: { en: 'Starter · 100 credits', zh: '体验装 · 100 积分' },
    note: { en: 'About 30 PDF or image runs', zh: '约可处理 30 次 PDF / 图片' }
  },
  {
    id: 2,
    credits: 500,
    priceCents: 4500,
    title: { en: 'Standard · 500 credits', zh: '标准装 · 500 积分' },
    note: { en: 'About 160 runs — 10% cheaper', zh: '约可处理 160 次，单次更便宜' }
  },
  {
    id: 3,
    credits: 1200,
    priceCents: 9900,
    title: { en: 'Term · 1200 credits', zh: '学期装 · 1200 积分' },
    note: { en: 'A whole term of preparation', zh: '够用一个学期，适合重度使用' }
  }
]

function isPackage(value: unknown): value is CreditPackage {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const title = item.title as Record<string, unknown> | undefined
  const note = item.note as Record<string, unknown> | undefined
  return Number.isInteger(item.id) && Number(item.id) > 0
    && Number.isInteger(item.credits) && Number(item.credits) > 0
    && Number.isInteger(item.priceCents) && Number(item.priceCents) > 0
    && typeof title?.en === 'string' && typeof title?.zh === 'string'
    && typeof note?.en === 'string' && typeof note?.zh === 'string'
}

/** Packs offered on `/credits`; falls back to the defaults when unset/invalid. */
export async function getCreditPackages(): Promise<CreditPackage[]> {
  const raw = await getConfigValue<string>('credits.packages', '')
  if (!raw) return DEFAULT_CREDIT_PACKAGES
  try {
    const parsed: unknown = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed.filter(isPackage) : []
    return list.length ? list.sort((a, b) => a.priceCents - b.priceCents) : DEFAULT_CREDIT_PACKAGES
  } catch {
    return DEFAULT_CREDIT_PACKAGES
  }
}

export async function findCreditPackage(packageId: number): Promise<CreditPackage | null> {
  const packages = await getCreditPackages()
  return packages.find(item => item.id === packageId) ?? null
}

/**
 * Credit a self-serve purchase exactly once.
 *
 * Alipay can deliver the same notification twice and the return page polls in
 * parallel, so the order number itself is the idempotency key: the ledger row
 * carries it in `note`, and the check runs inside the per-user lock.
 */
export async function fulfilCreditPurchase(input: {
  userId: number
  outTradeNo: string
  credits: number
}): Promise<{ granted: boolean, balance: number }> {
  const credits = assertAmount(input.credits, 'credits')
  return withUserLock(input.userId, async (client, balance) => {
    const already = await client.query(
      'SELECT 1 FROM credit_transactions WHERE user_id = $1 AND kind = $2 AND note = $3 LIMIT 1',
      [input.userId, 'purchase', input.outTradeNo]
    )
    if ((already.rowCount ?? 0) > 0) return { granted: false, balance }
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, kind, feature, note)
       VALUES ($1, $2, 'purchase', 'credits', $3)`,
      [input.userId, credits, input.outTradeNo.slice(0, 255)]
    )
    return { granted: true, balance: balance + credits }
  })
}

/**
 * Fulfil a paid Alipay order that bought credits.
 * Returns null when the order is not a credit purchase.
 */
export async function fulfilCreditOrder(order: {
  bizType?: string | null
  bizRefId?: number | null
  userId?: number | null
  outTradeNo?: string | null
}): Promise<{ granted: boolean, balance: number } | null> {
  if (order.bizType !== 'credits') return null
  if (!order.userId || !order.outTradeNo) {
    console.error('[credits] credit order without payer | order:', order.outTradeNo)
    return null
  }
  const pkg = order.bizRefId ? await findCreditPackage(order.bizRefId) : null
  if (!pkg) {
    console.error('[credits] credit package no longer exists | order:', order.outTradeNo, '| package:', order.bizRefId)
    return null
  }
  try {
    return await fulfilCreditPurchase({
      userId: order.userId,
      outTradeNo: order.outTradeNo,
      credits: pkg.credits
    })
  } catch (e) {
    console.error('[credits] credit fulfilment failed | order:', order.outTradeNo, e)
    return null
  }
}

/**
 * Members receive a monthly allowance, granted lazily the first time they show
 * up in a calendar month. `ref_id` (userId + YYYYMM) makes it idempotent, so no
 * cron job is needed.
 */
export async function grantMonthlyMemberCredits(userId: number): Promise<number> {
  const monthly = Math.max(0, Math.floor(Number(await getConfigValue<number>('credits.memberMonthly', 30)) || 0))
  if (monthly <= 0) return 0
  if (!(await userIsMember({ userId }))) return 0

  const now = new Date()
  const monthKey = now.getFullYear() * 100 + (now.getMonth() + 1)
  const marker = userId * 1_000_000 + monthKey

  return withUserLock(userId, async (client, balance) => {
    const already = await client.query('SELECT 1 FROM credit_transactions WHERE ref_id = $1 LIMIT 1', [marker])
    if ((already.rowCount ?? 0) > 0) return 0
    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, kind, feature, note, ref_id)
       VALUES ($1, $2, 'grant', 'membership.monthly', $3, $4)`,
      [userId, monthly, `monthly member allowance ${monthKey}`, marker]
    )
    console.log('[credits] monthly member allowance granted | user:', userId, '| credits:', monthly, '| balance:', balance + monthly)
    return monthly
  })
}
