import { createError, getRouterParam, getQuery, getRequestURL, getRequestIP, sendRedirect } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '~~/server/utils/db'
import { startSession } from '~~/server/utils/auth'
import {
  findUserByEmail,
  findUserByUsername,
  findRoleByName,
  findUserById,
  updateLastLogin
} from '~~/server/utils/users'
import { hashPassword } from '~~/server/utils/password'
import {
  isKnownOAuthProvider,
  getOAuthProviderCredentials,
  exchangeCodeForToken,
  fetchOAuthProfile,
  buildOAuthRedirectUri,
  verifyOAuthState,
  getOAuthPolicy,
  type OAuthProfile
} from '~~/server/utils/oauth'

function redirectToLogin(event: any, error: string, provider: string) {
  const params = new URLSearchParams({ oauth: 'error', provider, message: error })
  return sendRedirect(event, `/login?${params.toString()}`, 302)
}

/** Provision (or resolve) a local account for the given OAuth profile. */
async function resolveOAuthUser(
  provider: string,
  profile: OAuthProfile,
  policy: { provision: boolean, defaultRoleName: string }
): Promise<{ user: typeof schema.users.$inferSelect, linked: boolean }> {
  // 1) An existing link always wins.
  const [account] = await db.select().from(schema.oauthAccounts)
    .where(and(eq(schema.oauthAccounts.provider, provider), eq(schema.oauthAccounts.providerAccountId, profile.id)))
    .limit(1)
  if (account) {
    const user = await findUserById(account.userId)
    if (user && !user.deletedAt && user.isActive) return { user, linked: true }
  }

  // 2) Match an existing active user by verified email (auto-link).
  if (profile.email) {
    const existing = await findUserByEmail(profile.email)
    if (existing && !existing.deletedAt && existing.isActive) {
      await linkOAuthAccount(provider, profile, existing.id)
      return { user: existing, linked: true }
    }
  }

  // 3) Auto-provision a new account.
  if (!policy.provision) {
    throw new Error('No local account is linked to this OAuth identity, and auto-provisioning is disabled.')
  }
  const role = await findRoleByName(policy.defaultRoleName)
  if (!role) throw new Error(`Role "${policy.defaultRoleName}" not found`)
  const username = await uniqueUsername(profile.username ?? profile.name ?? profile.id, provider)
  const [user] = await db.insert(schema.users).values({
    username,
    name: profile.name ?? username,
    email: profile.email ?? `${username}@${provider}.local`,
    passwordHash: hashPassword(crypto.randomUUID()), // SSO-only account: unusable random password
    roleId: role.id,
    // The identity provider already verified the email, so mark it as verified.
    emailVerifiedAt: profile.email ? new Date() : undefined
  }).returning()
  if (!user) throw new Error('Failed to create SSO user')
  await linkOAuthAccount(provider, profile, user.id)
  return { user, linked: false }
}

async function linkOAuthAccount(provider: string, profile: OAuthProfile, userId: number): Promise<void> {
  await db.insert(schema.oauthAccounts).values({
    userId,
    provider,
    providerAccountId: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatarUrl
  }).onConflictDoNothing({ target: [schema.oauthAccounts.provider, schema.oauthAccounts.providerAccountId] })
}

async function uniqueUsername(base: string, provider: string): Promise<string> {
  const sanitized = base.toLowerCase().replace(/[^a-z0-9_-]/g, '') || `${provider}user`
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? sanitized : `${sanitized}${i}`
    const existing = await findUserByUsername(candidate)
    if (!existing) return candidate
  }
  return `${provider}${Date.now()}`
}

/**
 * GET /api/auth/oauth/:provider/callback
 * The provider redirects here after the user authorizes. We verify the state,
 * exchange the code, resolve/provision the local account, start a session and
 * redirect to the frontend.
 */
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  if (!isKnownOAuthProvider(provider)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Unknown OAuth provider: ${provider}` })
  }
  const query = getQuery(event) as { code?: string, state?: string }
  if (!query.code || !verifyOAuthState(provider!, query.state)) {
    return redirectToLogin(event, 'OAuth state validation failed', provider!)
  }

  const { clientSecret } = await getOAuthProviderCredentials(provider!)
  if (!clientSecret) {
    return redirectToLogin(event, 'OAuth provider is not configured', provider!)
  }

  try {
    const origin = getRequestURL(event).origin
    const redirectUri = buildOAuthRedirectUri(origin, provider!)
    const token = await exchangeCodeForToken(provider!, query.code, redirectUri)
    const profile = await fetchOAuthProfile(provider!, token)
    const policy = await getOAuthPolicy()

    const { user } = await resolveOAuthUser(provider!, profile, policy)

    await startSession(event, user.id)
    const trustProxy = process.env.TRUST_PROXY === 'true'
    const ip = getRequestIP(event, { xForwardedFor: trustProxy }) ?? null
    await updateLastLogin(user.id, ip).catch(() => {})

    const params = new URLSearchParams({ oauth: 'success', provider: provider! })
    return sendRedirect(event, `${policy.callbackRedirect}?${params.toString()}`, 302)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OAuth sign-in failed'
    return redirectToLogin(event, message, provider!)
  }
})