import { randomBytes, createHash } from 'node:crypto'
import { eq, and, lt, inArray } from 'drizzle-orm'
import { db } from './db'
import { tokens } from '../database/schema'
import { getConfigValue } from './configs'

const DEFAULT_TOKEN_TTL_DAYS = 7

export type TokenRow = typeof tokens.$inferSelect
export type TokenType = 'session' | 'password_reset' | 'email_verify'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// --- Session tokens ---

// Create a new persisted session token. Returns the plaintext token (to set in cookie).
// TTL is read from security.sessionTtlDays config (fallback: 7 days).
export async function createSessionToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const ttlDays = Math.max(1, await getConfigValue<number>('security.sessionTtlDays', DEFAULT_TOKEN_TTL_DAYS))
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
  await db.insert(tokens).values({ userId, tokenHash, type: 'session', expiresAt })
  return token
}

// Verify a session token from the cookie. Returns the user id if valid (exists, not expired).
export async function verifySessionToken(token: string | undefined): Promise<number | null> {
  if (!token) return null
  const tokenHash = hashToken(token)
  const [row] = await db.select({ userId: tokens.userId, expiresAt: tokens.expiresAt })
    .from(tokens)
    .where(and(eq(tokens.tokenHash, tokenHash), inArray(tokens.type, ['session'])))
    .limit(1)
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(tokens).where(eq(tokens.tokenHash, tokenHash))
    return null
  }
  return row.userId
}

// Delete a session token (logout)
export async function deleteSessionToken(token: string | undefined): Promise<void> {
  if (!token) return
  await db.delete(tokens).where(and(eq(tokens.tokenHash, hashToken(token)), eq(tokens.type, 'session')))
}

// --- Generic typed tokens (password reset, email verification) ---

// Create a typed token and persist its SHA-256 hash. Returns the plaintext token.
export async function createTypedToken(
  userId: number,
  type: TokenType,
  ttlMinutes: number
): Promise<{ token: string, expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + Math.max(1, ttlMinutes) * 60 * 1000)
  await db.insert(tokens).values({ userId, tokenHash, type, expiresAt })
  return { token, expiresAt }
}

// Verify a typed token. Returns the user id if valid (exists, not expired, type matches).
export async function verifyTypedToken(token: string, type: TokenType): Promise<number | null> {
  if (!token) return null
  const tokenHash = hashToken(token)
  const [row] = await db.select({ userId: tokens.userId, expiresAt: tokens.expiresAt })
    .from(tokens)
    .where(and(eq(tokens.tokenHash, tokenHash), eq(tokens.type, type)))
    .limit(1)
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(tokens).where(eq(tokens.tokenHash, tokenHash))
    return null
  }
  return row.userId
}

// Consume (delete) a typed token after use.
export async function consumeTypedToken(token: string, type: TokenType): Promise<void> {
  if (!token) return
  await db.delete(tokens).where(and(eq(tokens.tokenHash, hashToken(token)), eq(tokens.type, type)))
}

// Remove all tokens of a given type for a user (e.g. before issuing a fresh one).
export async function purgeUserTypedTokens(userId: number, type: TokenType): Promise<void> {
  await db.delete(tokens).where(and(eq(tokens.userId, userId), eq(tokens.type, type)))
}

// Periodic cleanup of ALL expired tokens (session, password_reset, email_verify).
export async function purgeExpiredTokens(): Promise<void> {
  await db.delete(tokens).where(lt(tokens.expiresAt, new Date()))
}
