import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
  createSign
} from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getHeader, getRequestURL } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { oauthClients, oauthAuthorizationCodes, oauthAccessTokens, oauthRefreshTokens } from '../database/schema'
import type { OAuthClient } from '../database/schema'
import { getConfigValue, upsertConfig } from './configs'
import { findRoleById, findUserById } from './users'

// ---------------------------------------------------------------------------
// OAuth 2.0 / OpenID Connect provider.
//
// This system acts as the identity provider: other applications register an
// OAuth client here and then use the standard endpoints
//   GET  /.well-known/openid-configuration
//   GET  /.well-known/jwks.json
//   GET  /oauth/authorize          (consent page)
//   POST /api/oauth/token          (authorization_code + refresh_token)
//   GET  /api/oauth/userinfo
//   POST /api/oauth/revoke
//   POST /api/oauth/introspect
//
// Supported: authorization code grant (with PKCE S256/plain), refresh-token
// rotation, RS256-signed id_tokens and opaque (hashed) access tokens.
// ---------------------------------------------------------------------------

export const SUPPORTED_SCOPES = ['openid', 'profile', 'email', 'roles'] as const
export type Scope = typeof SUPPORTED_SCOPES[number]

const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  openid: 'Verify your identity',
  profile: 'Read your basic profile (name, username, avatar)',
  email: 'Read your email address and verification status',
  roles: 'Read the roles assigned to your account'
}

const CODE_TTL_MS = 5 * 60 * 1000
const TOKEN_PREFIX = 'oat_'
const REFRESH_PREFIX = 'ort_'
const CLIENT_ID_PREFIX = 'app_'
const CLIENT_SECRET_PREFIX = 'sec_'

// --- config / discovery ---

export async function isOAuthServerEnabled(): Promise<boolean> {
  return await getConfigValue<boolean>('oauthServer.enabled', true)
}

export async function requireOAuthServerEnabled(): Promise<void> {
  if (!(await isOAuthServerEnabled())) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'OAuth provider disabled (set oauthServer.enabled = true)'
    })
  }
}

/**
 * Issuer identifier. Configure `oauthServer.issuer` (e.g. https://accounts.example.com)
 * behind a proxy; otherwise the request origin is used.
 */
export async function getOAuthIssuer(event: H3Event): Promise<string> {
  const configured = (await getConfigValue<string>('oauthServer.issuer', '')).trim()
  if (configured) return configured.replace(/\/$/, '')
  return getRequestURL(event).origin
}

// --- signing keys ---

interface SigningMaterial {
  privateKeyPem: string
  kid: string
  publicJwk: Record<string, string>
}

let keyCache: SigningMaterial | null = null

/**
 * RS256 signing key. Generated once and persisted in the `configs` table
 * (`oauthServer.privateKey`) so id_tokens stay verifiable across restarts and
 * across multiple instances sharing the database.
 */
export async function getSigningMaterial(): Promise<SigningMaterial> {
  if (keyCache) return keyCache
  let pem = (await getConfigValue<string>('oauthServer.privateKey', '')).trim()
  if (!pem || !pem.includes('BEGIN')) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    await upsertConfig({
      key: 'oauthServer.privateKey',
      value: pem,
      type: 'string',
      description: 'OAuth provider RS256 signing key (auto-generated, do not share)'
    })
    console.log('[oauth-server] generated new RS256 signing key')
  }
  const publicKey = createPublicKey(createPrivateKey(pem))
  const der = publicKey.export({ type: 'spki', format: 'der' })
  const kid = createHash('sha256').update(der).digest('hex').slice(0, 16)
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string>
  keyCache = {
    privateKeyPem: pem,
    kid,
    publicJwk: { ...jwk, kid, alg: 'RS256', use: 'sig' }
  }
  return keyCache
}

/** Public JSON Web Key Set for `/.well-known/jwks.json`. */
export async function getJwks(): Promise<{ keys: Record<string, string>[] }> {
  const { publicJwk } = await getSigningMaterial()
  return { keys: [publicJwk] }
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** Sign an id_token (JWT, RS256) with the provider key. */
export async function signIdToken(claims: Record<string, unknown>): Promise<string> {
  const { privateKeyPem, kid } = await getSigningMaterial()
  const header = { alg: 'RS256', typ: 'JWT', kid }
  const payload = base64UrlEncode(JSON.stringify(claims))
  const head = base64UrlEncode(JSON.stringify(header))
  const signature = createSign('RSA-SHA256')
    .update(`${head}.${payload}`)
    .sign(privateKeyPem, 'base64url')
  return `${head}.${payload}.${signature}`
}

// --- tokens ---

export function hashOAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${randomBytes(bytes).toString('hex')}`
}

export function generateClientId(): string {
  return randomToken(CLIENT_ID_PREFIX, 12)
}

export function generateClientSecret(): string {
  return randomToken(CLIENT_SECRET_PREFIX, 24)
}

// --- client helpers ---

export function parseRedirectUris(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
}

export function parseScopes(value: string | null | undefined): string[] {
  if (!value) return []
  return value.split(/\s+/).map(v => v.trim()).filter(Boolean)
}

/** Keep only supported scopes, preserving input order. */
export function normalizeScopes(requested: string[], allowed: string[]): Scope[] {
  const allowedSet = new Set(allowed)
  const out: Scope[] = []
  for (const scope of requested) {
    if (!allowedSet.has(scope)) continue
    if (!(SUPPORTED_SCOPES as readonly string[]).includes(scope)) continue
    if (!out.includes(scope as Scope)) out.push(scope as Scope)
  }
  return out
}

export function scopeListForConsent(scopes: Scope[]) {
  return scopes.map(scope => ({ scope, description: SCOPE_DESCRIPTIONS[scope] }))
}

export async function findOAuthClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId) return null
  const [row] = await db.select().from(oauthClients)
    .where(and(eq(oauthClients.clientId, clientId), eq(oauthClients.isActive, true), isNull(oauthClients.deletedAt)))
    .limit(1)
  return row ?? null
}

/** Constant-time comparison of a presented secret against the stored hash. */
export function verifyClientSecret(secret: string, storedHash: string | null): boolean {
  if (!storedHash) return false
  const a = Buffer.from(hashOAuthToken(secret), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Read `client_id` / `client_secret` from a Basic auth header or the body. */
export function readClientCredentials(
  event: H3Event,
  body: Record<string, unknown>
): { clientId: string, clientSecret: string } {
  const header = getHeader(event, 'authorization') ?? ''
  if (header.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx > -1) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, idx)),
        clientSecret: decodeURIComponent(decoded.slice(idx + 1))
      }
    }
  }
  return {
    clientId: String(body.client_id ?? ''),
    clientSecret: String(body.client_secret ?? '')
  }
}

/**
 * Authenticate a client for the token / revoke / introspect endpoints.
 * Public clients authenticate with `client_id` only.
 */
export async function authenticateOAuthClient(
  event: H3Event,
  body: Record<string, unknown>
): Promise<OAuthClient> {
  const { clientId, clientSecret } = readClientCredentials(event, body)
  const client = await findOAuthClient(clientId)
  if (!client) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'invalid_client' })
  }
  if (client.isPublic) return client
  if (!clientSecret || !verifyClientSecret(clientSecret, client.clientSecretHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'invalid_client' })
  }
  return client
}

// --- authorize request validation ---

export interface AuthorizeRequest {
  client: OAuthClient
  redirectUri: string
  scopes: Scope[]
  state: string | null
  nonce: string | null
  codeChallenge: string | null
  codeChallengeMethod: 'S256' | 'plain' | null
}

function oauthError(error: string, description: string, statusCode = 400) {
  return createError({ statusCode, statusMessage: error, message: `${error}: ${description}` })
}

/**
 * Validate an authorize request. Redirect-URI validation happens before any
 * error can be redirected, so an invalid redirect_uri always renders an error
 * page instead of leaking a code to an unregistered URI.
 */
export async function validateAuthorizeRequest(
  event: H3Event,
  query: Record<string, string | undefined>
): Promise<AuthorizeRequest> {
  await requireOAuthServerEnabled()

  const clientId = query.client_id?.trim() ?? ''
  const client = await findOAuthClient(clientId)
  if (!client) throw oauthError('unauthorized_client', 'unknown or inactive client_id')

  const redirectUri = query.redirect_uri?.trim() ?? ''
  const registered = parseRedirectUris(client.redirectUris)
  if (!redirectUri || !registered.includes(redirectUri)) {
    throw oauthError('invalid_request', 'redirect_uri is not registered for this client')
  }

  const responseType = query.response_type ?? 'code'
  if (responseType !== 'code') {
    throw oauthError('unsupported_response_type', 'only response_type=code is supported')
  }

  const allowed = parseScopes(client.scopes)
  const requested = parseScopes(query.scope ?? 'openid')
  const scopes = normalizeScopes(requested, allowed)
  if (requested.includes('openid') && !scopes.includes('openid')) {
    throw oauthError('invalid_scope', 'openid is not allowed for this client')
  }
  if (scopes.length === 0) {
    throw oauthError('invalid_scope', 'no supported scope was requested')
  }
  // OIDC requires plain OAuth2 clients to skip openid; a client asking for
  // openid without the scope being allowed above is already rejected.

  const method = (query.code_challenge_method ?? '') as 'S256' | 'plain' | ''
  const challenge = query.code_challenge?.trim() || null
  if (challenge && method && !['S256', 'plain'].includes(method)) {
    throw oauthError('invalid_request', 'unsupported code_challenge_method')
  }
  if (client.isPublic && !challenge) {
    throw oauthError('invalid_request', 'PKCE code_challenge is required for public clients')
  }

  return {
    client,
    redirectUri,
    scopes,
    state: query.state?.trim() || null,
    nonce: query.nonce?.trim() || null,
    codeChallenge: challenge,
    codeChallengeMethod: challenge ? ((method || 'plain') as 'S256' | 'plain') : null
  }
}

/** Build a redirect back to the client carrying `code` or `error`. */
export function buildAuthorizeRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>
): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    url.searchParams.set(key, value)
  }
  return url.toString()
}

// --- code / token issuance ---

export async function createAuthorizationCode(input: {
  client: OAuthClient
  userId: number
  redirectUri: string
  scopes: Scope[]
  nonce: string | null
  codeChallenge: string | null
  codeChallengeMethod: 'S256' | 'plain' | null
}): Promise<string> {
  const code = randomToken('oac_')
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hashOAuthToken(code),
    clientId: input.client.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scope: input.scopes.join(' '),
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    nonce: input.nonce,
    expiresAt: new Date(Date.now() + CODE_TTL_MS)
  })
  return code
}

/** Verify a PKCE code_verifier against the stored challenge. */
export function verifyPkce(codeVerifier: string, challenge: string, method: string | null): boolean {
  if (!method || method === 'plain') {
    return codeVerifier === challenge
  }
  const computed = createHash('sha256').update(codeVerifier).digest('base64url')
  return computed === challenge
}

export interface IssuedTokens {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string | null
  idToken: string | null
  scope: string
}

/** Claims shared by id_token and userinfo. */
export async function buildUserClaims(userId: number, scopes: string[]) {
  const user = await findUserById(userId)
  if (!user || !user.isActive || user.deletedAt) {
    throw oauthError('invalid_grant', 'user is no longer active', 400)
  }
  const claims: Record<string, unknown> = { sub: String(user.id) }
  if (scopes.includes('profile')) {
    claims.name = user.name ?? user.username
    claims.preferred_username = user.username
    if (user.avatarPath) claims.picture = user.avatarPath
    if (user.gender) claims.gender = user.gender
    if (user.birthday) claims.birthday = user.birthday
  }
  if (scopes.includes('email')) {
    claims.email = user.email
    claims.email_verified = !!user.emailVerifiedAt
  }
  if (scopes.includes('roles')) {
    const role = await findRoleById(user.roleId)
    claims.role = role?.name ?? null
  }
  return { user, claims }
}

/** Issue access token, optional refresh token and optional id_token. */
export async function issueTokens(input: {
  client: OAuthClient
  userId: number
  scopes: string[]
  issuer: string
  nonce?: string | null
  withRefreshToken?: boolean
}): Promise<IssuedTokens> {
  const accessToken = randomToken(TOKEN_PREFIX)
  const ttlMinutes = Math.max(5, input.client.accessTokenTtlMinutes ?? 60)
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

  await db.insert(oauthAccessTokens).values({
    tokenHash: hashOAuthToken(accessToken),
    clientId: input.client.clientId,
    userId: input.userId,
    scope: input.scopes.join(' '),
    expiresAt
  })

  let refreshToken: string | null = null
  if (input.withRefreshToken) {
    refreshToken = randomToken(REFRESH_PREFIX)
    const refreshDays = Math.max(1, input.client.refreshTokenTtlDays ?? 30)
    await db.insert(oauthRefreshTokens).values({
      tokenHash: hashOAuthToken(refreshToken),
      clientId: input.client.clientId,
      userId: input.userId,
      scope: input.scopes.join(' '),
      expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000)
    })
  }

  let idToken: string | null = null
  if (input.scopes.includes('openid')) {
    const { claims } = await buildUserClaims(input.userId, input.scopes)
    const now = Math.floor(Date.now() / 1000)
    idToken = await signIdToken({
      iss: input.issuer,
      aud: input.client.clientId,
      iat: now,
      exp: now + ttlMinutes * 60,
      auth_time: now,
      ...(input.nonce ? { nonce: input.nonce } : {}),
      ...claims
    })
  }

  return {
    accessToken,
    accessTokenExpiresIn: ttlMinutes * 60,
    refreshToken,
    idToken,
    scope: input.scopes.join(' ')
  }
}

/** Resolve a bearer token to its access-token row. */
export async function resolveAccessToken(token: string) {
  if (!token) return null
  const [row] = await db.select({ token: oauthAccessTokens, clientIsActive: oauthClients.isActive, clientDeletedAt: oauthClients.deletedAt })
    .from(oauthAccessTokens)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthAccessTokens.clientId))
    .where(and(eq(oauthAccessTokens.tokenHash, hashOAuthToken(token)), isNull(oauthAccessTokens.revokedAt)))
    .limit(1)
  if (!row) return null
  // A disabled or deleted client must not be able to keep using old tokens.
  if (!row.clientIsActive || row.clientDeletedAt) return null
  if (row.token.expiresAt.getTime() < Date.now()) return null
  return row.token
}
