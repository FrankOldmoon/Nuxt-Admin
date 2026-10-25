import { desc, eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { PoolClient } from 'pg'
import { db, pool } from './db'
import { creditTransactions } from '../database/schema'

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
