import type { H3Event } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '~~/server/database'
import { oauthAuthorizationCodes, oauthRefreshTokens } from '~~/server/database/schema'
import {
  authenticateOAuthClient,
  getOAuthIssuer,
  hashOAuthToken,
  issueTokens,
  requireOAuthServerEnabled,
  verifyPkce
} from '~~/server/utils/oauthServer'

/** RFC 6749 error response (`error` field, HTTP 400). */
function tokenError(event: H3Event, error: string, description: string, statusCode = 400) {
  setResponseStatus(event, statusCode)
  return { error, error_description: description }
}

// POST /api/oauth/token — the token endpoint (authorization_code + refresh_token).
// Accepts application/x-www-form-urlencoded (standard) or JSON.
// Client authentication: HTTP Basic or client_id/client_secret in the body;
// public clients send client_id only and must use PKCE.
export default defineEventHandler(async (event) => {
  await requireOAuthServerEnabled()
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Pragma', 'no-cache')

  const body = await readBody<Record<string, unknown>>(event).catch(() => ({})) ?? {}
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined) params[key] = String(value)
  }

  const grantType = params.grant_type ?? ''
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return tokenError(event, 'unsupported_grant_type', 'supported: authorization_code, refresh_token')
  }

  let client
  try {
    client = await authenticateOAuthClient(event, params)
  } catch {
    return tokenError(event, 'invalid_client', 'client authentication failed', 401)
  }

  const issuer = await getOAuthIssuer(event)

  // --- authorization_code ---
  if (grantType === 'authorization_code') {
    const code = params.code ?? ''
    if (!code) return tokenError(event, 'invalid_request', 'code is required')

    const [row] = await db.select().from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, hashOAuthToken(code)))
      .limit(1)
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
      return tokenError(event, 'invalid_grant', 'authorization code is invalid, expired or already used')
    }
    if (row.clientId !== client.clientId) {
      return tokenError(event, 'invalid_grant', 'authorization code was issued to another client')
    }
    if (params.redirect_uri && params.redirect_uri !== row.redirectUri) {
      return tokenError(event, 'invalid_grant', 'redirect_uri does not match the authorize request')
    }

    // PKCE: required for public clients, verified whenever a challenge is stored
    if (row.codeChallenge) {
      const verifier = params.code_verifier ?? ''
      if (!verifier) return tokenError(event, 'invalid_grant', 'code_verifier is required')
      if (!verifyPkce(verifier, row.codeChallenge, row.codeChallengeMethod)) {
        return tokenError(event, 'invalid_grant', 'code_verifier does not match the code challenge')
      }
    } else if (client.isPublic) {
      return tokenError(event, 'invalid_grant', 'PKCE is required for public clients')
    }

    // Single-use: consume before issuing, so a replay cannot race a second issue
    const [consumed] = await db.update(oauthAuthorizationCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(oauthAuthorizationCodes.id, row.id), isNull(oauthAuthorizationCodes.consumedAt)))
      .returning({ id: oauthAuthorizationCodes.id })
    if (!consumed) {
      return tokenError(event, 'invalid_grant', 'authorization code is invalid, expired or already used')
    }

    const tokens = await issueTokens({
      client,
      userId: row.userId,
      scopes: row.scope ? row.scope.split(' ') : [],
      issuer,
      nonce: row.nonce,
      withRefreshToken: true
    })

    console.log('[oauth-server] tokens issued (code) | client:', client.clientId, '| user:', row.userId)

    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.accessTokenExpiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
      ...(tokens.idToken ? { id_token: tokens.idToken } : {})
    }
  }

  // --- refresh_token (with rotation) ---
  const refreshToken = params.refresh_token ?? ''
  if (!refreshToken) return tokenError(event, 'invalid_request', 'refresh_token is required')

  const [stored] = await db.select().from(oauthRefreshTokens)
    .where(and(eq(oauthRefreshTokens.tokenHash, hashOAuthToken(refreshToken)), isNull(oauthRefreshTokens.revokedAt)))
    .limit(1)
  if (!stored || stored.expiresAt.getTime() < Date.now()) {
    return tokenError(event, 'invalid_grant', 'refresh token is invalid, expired or revoked')
  }
  if (stored.clientId !== client.clientId) {
    return tokenError(event, 'invalid_grant', 'refresh token was issued to another client')
  }

  // Rotation: revoke the presented token, then issue a fresh pair
  const [revoked] = await db.update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthRefreshTokens.id, stored.id), isNull(oauthRefreshTokens.revokedAt)))
    .returning({ id: oauthRefreshTokens.id })
  if (!revoked) {
    return tokenError(event, 'invalid_grant', 'refresh token is invalid, expired or revoked')
  }

  const tokens = await issueTokens({
    client,
    userId: stored.userId,
    scopes: stored.scope ? stored.scope.split(' ') : [],
    issuer,
    withRefreshToken: true
  })

  console.log('[oauth-server] tokens refreshed | client:', client.clientId, '| user:', stored.userId)

  return {
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.accessTokenExpiresIn,
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
    ...(tokens.idToken ? { id_token: tokens.idToken } : {})
  }
})
