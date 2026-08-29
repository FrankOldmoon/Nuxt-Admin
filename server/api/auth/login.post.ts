import { eq } from 'drizzle-orm'
import { scryptSync } from 'node:crypto'
import { createError, getRequestIP } from 'h3'
import { users } from '~~/server/database/schema'
import { getConfigValue } from '~~/server/utils/configs'
import { verifyCaptcha } from '~~/server/utils/captcha'

// Dummy password hash used to equalize timing between user-exists and user-not-exists paths,
// preventing user-enumeration via timing side-channels.
const DUMMY_SALT = '0'.repeat(32)
const DUMMY_HASH_HEX = '0'.repeat(128)

// Account lock parameters (overridable via security.* config)
async function lockParams(): Promise<{ maxAttempts: number, lockMs: number }> {
  const maxAttempts = Math.max(3, await getConfigValue<number>('security.loginMaxAttempts', 5))
  const lockMinutes = Math.max(1, await getConfigValue<number>('security.loginLockMinutes', 15))
  return { maxAttempts, lockMs: lockMinutes * 60 * 1000 }
}

/** Increment the failed-login counter and lock the account once it reaches the threshold. */
async function recordFailedLogin(userId: number): Promise<void> {
  const { maxAttempts, lockMs } = await lockParams()
  const [row] = await db
    .select({ failedLoginCount: users.failedLoginCount })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const count = (row?.failedLoginCount ?? 0) + 1
  const set: Record<string, unknown> = { failedLoginCount: count, updatedAt: new Date() }
  if (count >= maxAttempts) {
    set.lockedUntil = new Date(Date.now() + lockMs)
  }
  await db.update(users).set(set).where(eq(users.id, userId))
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ identifier?: string, password?: string, captchaId?: string, captchaText?: string }>(event)
  const identifier = body?.identifier?.trim()
  const password = body?.password

  if (!identifier || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Identifier and password are required' })
  }

  // Captcha (can be disabled via security.captchaEnabled config)
  const captchaEnabled = await getConfigValue<boolean>('security.captchaEnabled', true)
  if (captchaEnabled && !(await verifyCaptcha(body?.captchaId, body?.captchaText))) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid or expired captcha' })
  }

  // Rate limit: max 5 login attempts per IP+identifier every 15 minutes
  await enforceRateLimit(event, { keyPrefix: 'login', max: 5, windowMs: 15 * 60 * 1000, identifier })

  const user = await findUserByUsernameOrEmail(identifier)

  // Account lock check (before password verification, so a locked account is
  // not subject to brute-force attempts)
  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    throw createError({
      statusCode: 423,
      statusMessage: 'Locked',
      message: `Account temporarily locked. Try again in ${mins} minute(s).`
    })
  }

  // Always perform a password verify (even when user not found) to minimize timing
  // differences between "user doesn't exist" and "wrong password" paths, which
  // would otherwise allow attackers to enumerate valid accounts.
  let passwordValid = false
  try {
    const stored = user?.passwordHash ?? `${DUMMY_SALT}:${DUMMY_HASH_HEX}`
    const [salt, storedHash] = ((): [string, string] => {
      const sep = stored.indexOf(':')
      if (sep < 0) return [DUMMY_SALT, DUMMY_HASH_HEX]
      const s = stored.slice(0, sep)
      const h = stored.slice(sep + 1)
      return [s || DUMMY_SALT, h.length === 128 ? h : DUMMY_HASH_HEX]
    })()
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(storedHash, 'hex')
    if (candidate.length === expected.length) {
      const { timingSafeEqual } = await import('node:crypto')
      passwordValid = timingSafeEqual(candidate, expected) && !!user
    } else {
      // Dummy compare of same-length buffers to avoid leaking hash length
      const { timingSafeEqual } = await import('node:crypto')
      const dummy = Buffer.alloc(expected.length, 0)
      timingSafeEqual(dummy, expected)
      passwordValid = false
    }
  } catch {
    passwordValid = false
  }

  if (!user || !passwordValid) {
    // Increment the failure counter + possible lock (only when the user actually exists)
    if (user) await recordFailedLogin(user.id)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Invalid credentials' })
  }
  if (!user.isActive) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Account is disabled' })
  }

  // Best-effort cleanup of expired tokens
  await purgeExpiredTokens().catch(() => {})

  const role = await findRoleById(user.roleId)
  await startSession(event, user.id)

  // Update last login timestamp/IP (best-effort; ignore failures) and return updated row
  const trustProxy = process.env.TRUST_PROXY === 'true'
  const ip = getRequestIP(event, { xForwardedFor: trustProxy }) ?? null
  const [updated] = await Promise.all([
    (async () => {
      try {
        const res = await db
          .update(users)
          .set({ lastLoginAt: new Date(), lastLoginIp: ip, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning()
        return res[0] ?? user
      } catch {
        return user
      }
    })()
  ])

  return { user: toPublicUser(updated ?? user, role) }
})
