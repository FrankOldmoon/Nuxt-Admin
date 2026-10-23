import { authenticateOAuthClient, requireOAuthServerEnabled, resolveAccessToken } from '~~/server/utils/oauthServer'

// POST /api/oauth/introspect — RFC 7662 token introspection.
// Lets a resource server validate an opaque access token and read its
// metadata (client, subject, scopes, expiry) in one call.
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
  const row = token ? await resolveAccessToken(token) : null
  // Unknown or expired tokens answer { active: false } (RFC 7662, never 404)
  if (!row) return { active: false }
  if (row.clientId !== client.clientId) return { active: false }

  return {
    active: true,
    client_id: row.clientId,
    sub: String(row.userId),
    scope: row.scope,
    token_type: 'Bearer',
    exp: Math.floor(row.expiresAt.getTime() / 1000),
    iat: Math.floor(row.createdAt.getTime() / 1000)
  }
})
