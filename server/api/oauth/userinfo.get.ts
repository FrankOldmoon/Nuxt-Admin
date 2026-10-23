import { createError, getHeader } from 'h3'
import {
  buildUserClaims,
  requireOAuthServerEnabled,
  resolveAccessToken
} from '~~/server/utils/oauthServer'

// GET|POST /api/oauth/userinfo — OIDC userinfo endpoint.
// Authorization: Bearer <access_token>. Returns claims according to the scopes
// granted to that access token (always `sub`).
export default defineEventHandler(async (event) => {
  await requireOAuthServerEnabled()
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const header = getHeader(event, 'authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer realm="oauth", error="invalid_token"')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'missing bearer token' })
  }

  const row = await resolveAccessToken(token)
  if (!row) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer realm="oauth", error="invalid_token"')
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'invalid or expired access token' })
  }

  const scopes = row.scope ? row.scope.split(' ') : []
  const { claims } = await buildUserClaims(row.userId, scopes)
  return claims
})
