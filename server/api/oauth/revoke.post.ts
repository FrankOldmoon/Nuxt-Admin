import { and, eq, isNull } from 'drizzle-orm'
import { db } from '~~/server/database'
import { oauthAccessTokens, oauthRefreshTokens } from '~~/server/database/schema'
import {
  authenticateOAuthClient,
  hashOAuthToken,
  requireOAuthServerEnabled
} from '~~/server/utils/oauthServer'

// POST /api/oauth/revoke — RFC 7009 token revocation.
// Accepts a refresh token or an access token; always answers 200 (per spec)
// even for unknown tokens, and never reveals whether the token existed.
export default defineEventHandler(async (event) => {
  await requireOAuthServerEnabled()
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({})) ?? {}
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined) params[key] = String(value)
  }

  let client
  try {
    client = await authenticateOAuthClient(event, params)
  } catch {
    setResponseStatus(event, 401)
    return { error: 'invalid_client' }
  }

  const token = params.token ?? ''
  if (!token) return { ok: true }

  const tokenHash = hashOAuthToken(token)
  const revocation = new Date()

  // A token may be of either kind; revoke both matches (only own-client rows).
  await db.update(oauthRefreshTokens)
    .set({ revokedAt: revocation })
    .where(and(
      eq(oauthRefreshTokens.tokenHash, tokenHash),
      eq(oauthRefreshTokens.clientId, client.clientId),
      isNull(oauthRefreshTokens.revokedAt)
    ))
  await db.update(oauthAccessTokens)
    .set({ revokedAt: revocation })
    .where(and(
      eq(oauthAccessTokens.tokenHash, tokenHash),
      eq(oauthAccessTokens.clientId, client.clientId),
      isNull(oauthAccessTokens.revokedAt)
    ))

  console.log('[oauth-server] token revoked | client:', client.clientId)
  return { ok: true }
})
