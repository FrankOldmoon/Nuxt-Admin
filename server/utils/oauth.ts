import { createHmac, timingSafeEqual } from 'node:crypto'
import { getConfigValue } from './configs'

// ---------------------------------------------------------------------------
// Stateless OAuth2 helpers.
// - Providers are configured via the `configs` table (`oauth.<provider>.*`).
// - The `state` parameter is a signed HMAC token so the callback can verify the
//   authorize request originated from us, without any server-side session.
// ---------------------------------------------------------------------------

export interface OAuthProfile {
  provider: string
  id: string
  email: string | null
  name: string | null
  username?: string | null
  avatarUrl?: string | null
}

interface OAuthProviderDef {
  name: string
  /** Endpoint the user is redirected to in order to authorize */
  authorizeUrl: string
  /** Endpoint used to exchange the authorization code for an access token */
  tokenUrl: string
  /** Endpoint used to fetch the authenticated user's profile */
  userinfoUrl: string
  /** OAuth2 scopes requested for the profile */
  scope: string
  /** Map a provider-specific profile JSON to the normalized OAuthProfile */
  profile: (json: Record<string, any>) => OAuthProfile
}

// Built-in provider presets. Adding more SSO providers is just a matter of
// registering a new entry here plus the matching `oauth.<name>.*` configs.
const PROVIDERS: Record<string, OAuthProviderDef> = {
  github: {
    name: 'github',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userinfoUrl: 'https://api.github.com/user',
    // read:user gives id/login/name/avatar; user:email lets us fetch the primary email.
    scope: 'read:user user:email',
    profile: (j) => ({
      provider: 'github',
      id: String(j.id ?? ''),
      email: j.email ?? null,
      name: j.name ?? j.login ?? null,
      username: j.login ?? null,
      avatarUrl: j.avatar_url ?? null
    })
  }
}

const PROVIDER_NAMES = Object.keys(PROVIDERS)

export function isKnownOAuthProvider(name: string | undefined): boolean {
  return !!name && PROVIDER_NAMES.includes(name)
}

export function listEnabledOAuthProviders(): string[] {
  // Kept synchronous: the enabled flag is read on the login page request.
  return PROVIDER_NAMES
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function stateSecret(): string {
  return process.env.SESSION_SECRET || 'nuxt-admin-oauth-dev-secret-change-me'
}

const STATE_TTL_MS = 10 * 60 * 1000 // authorize URL valid for 10 minutes

/**
 * Sign a stateless `state` token: `base36(timestamp).provider.HMAC`.
 * Encodes the provider so the callback can reject mismatched providers.
 */
export function signOAuthState(provider: string): string {
  const secret = stateSecret()
  const ts = Date.now()
  const payload = `${ts.toString(36)}.${provider}`
  return `${payload}.${hmac(secret, payload).slice(0, 32)}`
}

/** Verify a `state` token (signature + expiry + provider match). */
export function verifyOAuthState(provider: string, state: string | undefined): boolean {
  if (!state) return false
  const secret = stateSecret()
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const ts = Number.parseInt(parts[0]!, 36)
  if (!Number.isFinite(ts)) return false
  if (parts[1] !== provider) return false
  const now = Date.now()
  if (now - ts > STATE_TTL_MS || ts > now + STATE_TTL_MS) return false
  const expected = hmac(secret, `${parts[0]}.${parts[1]}`).slice(0, 32)
  const actual = parts[2]!
  if (expected.length !== actual.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

/** Resolve the configured client id/secret + enabled flag for a provider. */
export async function getOAuthProviderCredentials(name: string): Promise<{
  enabled: boolean
  clientId: string
  clientSecret: string
}> {
  const enabled = await getConfigValue<boolean>(`oauth.${name}.enabled`, false)
  const clientId = (await getConfigValue<string>(`oauth.${name}.clientId`, '')).trim()
  const clientSecret = (await getConfigValue<string>(`oauth.${name}.clientSecret`, '')).trim()
  return { enabled, clientId, clientSecret }
}

/** Global SSO provisioning policy config. */
export async function getOAuthPolicy(): Promise<{
  provision: boolean
  defaultRoleName: string
  callbackRedirect: string
}> {
  const provision = await getConfigValue<boolean>('oauth.provision', true)
  const defaultRoleName = (await getConfigValue<string>('oauth.defaultRoleName', 'user')).trim() || 'user'
  return {
    provision,
    defaultRoleName,
    callbackRedirect: (await getConfigValue<string>('oauth.callbackRedirect', '/')).trim() || '/'
  }
}

/** Build the authorization URL the browser is redirected to. */
export async function buildAuthorizeUrl(name: string, redirectUri: string): Promise<string> {
  const def = PROVIDERS[name]!
  const { clientId } = await getOAuthProviderCredentials(name)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: def.scope,
    response_type: 'code',
    state: signOAuthState(name)
  })
  return `${def.authorizeUrl}?${params.toString()}`
}

/** Exchange an authorization code for an access token. */
export async function exchangeCodeForToken(
  name: string,
  code: string,
  redirectUri: string
): Promise<string> {
  const def = PROVIDERS[name]!
  const { clientId, clientSecret } = await getOAuthProviderCredentials(name)
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
  const res = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString()
  })
  const text = await res.text()
  let data: Record<string, any>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`OAuth: invalid token response from ${name}`)
  }
  const token = data.access_token
  if (!token) {
    throw new Error(`OAuth: no access token for ${name} (${data.error_description ?? data.error ?? 'unknown error'})`)
  }
  return String(token)
}

/** Fetch the authenticated user's profile with the access token. */
export async function fetchOAuthProfile(name: string, accessToken: string): Promise<OAuthProfile> {
  const def = PROVIDERS[name]!
  const res = await fetch(def.userinfoUrl, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json',
      'user-agent': 'nuxt-admin' }
  })
  if (!res.ok) throw new Error(`OAuth: profile request failed for ${name} (${res.status})`)
  const json = await res.json()
  const profile = def.profile(json ?? {})
  profile.provider = name
  return profile
}

/** Build the callback redirect URI for a provider from the request origin. */
export function buildOAuthRedirectUri(origin: string, name: string): string {
  return `${origin.replace(/\/$/, '')}/api/auth/oauth/${name}/callback`
}