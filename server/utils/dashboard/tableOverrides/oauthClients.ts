// OAuth clients table — custom create / update / getOne + list sanitisation.
//
// Registered as a `TableCrudHandler` (create/update/getOne only, so the
// generic list endpoint still runs and applies the list override below) plus
// a `TableListOverride` that removes the stored secret hash from every row.
//
// Rules enforced here:
//   - `clientId` and the secret are always generated server-side; the
//     plaintext secret is returned exactly once (create / rotate).
//   - `redirectUris` must be newline-separated absolute http(s) URLs without
//     a fragment; matching at the authorize endpoint is exact.
//   - `scopes` is restricted to SUPPORTED_SCOPES.
//   - Public clients (SPA / mobile) never receive a secret and must use PKCE.

import { createError, getRouterParam, readBody } from 'h3'
import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { oauthClients } from '~~/server/database/schema'
import type { OAuthClient } from '~~/server/database/schema'
import { requireAdmin } from '~~/server/utils/auth'
import {
  generateClientId,
  generateClientSecret,
  hashOAuthToken,
  SUPPORTED_SCOPES
} from '~~/server/utils/oauthServer'
import type { TableCrudHandler, TableListOverride } from '../tableOverrides'

/** Client row without the secret hash; `hasClientSecret` is derived for the UI. */
function sanitizeClient(row: OAuthClient): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row }
  delete rest.clientSecretHash
  return { ...rest, hasClientSecret: !!row.clientSecretHash }
}

function badRequest(message: string) {
  return createError({ statusCode: 400, statusMessage: 'Bad Request', message })
}

/** Normalise the redirect URI list (newline/comma separated) and validate it. */
function validateRedirectUris(raw: unknown): string {
  const text = Array.isArray(raw) ? raw.map(String).join('\n') : String(raw ?? '')
  const uris = text.split(/[\n,]+/).map(v => v.trim()).filter(Boolean)
  if (uris.length === 0) throw badRequest('At least one redirect URI is required')
  for (const uri of uris) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      throw badRequest(`Invalid redirect URI: ${uri}`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw badRequest(`Redirect URIs must use http:// or https://: ${uri}`)
    }
    if (parsed.hash) throw badRequest(`Redirect URIs must not contain a fragment: ${uri}`)
    if (uri.includes('*')) throw badRequest(`Wildcards are not allowed in redirect URIs: ${uri}`)
  }
  return uris.join('\n')
}

/** Keep only supported scopes; reject the request if any unsupported one was sent. */
function validateScopes(raw: unknown): string {
  const list = (Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/[\s,]+/))
    .map(s => s.trim())
    .filter(Boolean)
  const unique = [...new Set(list)]
  if (unique.length === 0) return 'openid profile email'
  const unsupported = unique.filter(s => !(SUPPORTED_SCOPES as readonly string[]).includes(s))
  if (unsupported.length > 0) {
    throw badRequest(`Unsupported scope(s): ${unsupported.join(', ')}. Supported: ${SUPPORTED_SCOPES.join(', ')}`)
  }
  return unique.join(' ')
}

function optionalText(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value || null
}

function intInRange(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw)
  // Empty / zero values come from the generic form's unset number fields.
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Generate a clientId that is not used yet (active or soft-deleted). */
async function uniqueClientId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateClientId()
    const [existing] = await db.select({ id: oauthClients.id })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, candidate))
      .limit(1)
    if (!existing) return candidate
  }
  throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Could not allocate a client id' })
}

async function findClientById(id: number): Promise<OAuthClient | null> {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1)
  return row ?? null
}

/** Secrecy wrapper: never expose `clientSecretHash` in list responses. */
export const oauthClientsListOverride: TableListOverride = {
  table: 'oauthClients',
  list(rows) {
    return rows.map((row) => {
      const next = { ...row }
      delete next.clientSecretHash
      next.hasClientSecret = !!row.clientSecretHash
      return next
    })
  }
}

const handler: TableCrudHandler = {
  table: 'oauthClients',

  async getOne(event: H3Event) {
    await requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!id) throw badRequest('Invalid client id')
    const client = await findClientById(id)
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'OAuth client not found' })
    return { item: sanitizeClient(client) }
  },

  async create(event: H3Event) {
    await requireAdmin(event)
    const body = await readBody<Record<string, unknown>>(event) ?? {}

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw badRequest('Application name is required')
    if (name.length > 100) throw badRequest('Application name must be at most 100 chars')

    const redirectUris = validateRedirectUris(body.redirectUris)
    const scopes = validateScopes(body.scopes)
    const isPublic = body.isPublic === true || body.isPublic === 'true'

    const clientId = await uniqueClientId()
    // Public clients have no secret; confidential clients get one shown once.
    const plainSecret = isPublic ? null : generateClientSecret()

    const [row] = await db.insert(oauthClients).values({
      clientId,
      clientSecretHash: plainSecret ? hashOAuthToken(plainSecret) : null,
      name,
      description: optionalText(body.description),
      homepageUrl: optionalText(body.homepageUrl),
      logoUrl: optionalText(body.logoUrl),
      redirectUris,
      scopes,
      isPublic,
      isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true',
      accessTokenTtlMinutes: intInRange(body.accessTokenTtlMinutes, 60, 5, 1440),
      refreshTokenTtlDays: intInRange(body.refreshTokenTtlDays, 30, 1, 365)
    }).returning()

    if (!row) {
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to create OAuth client' })
    }

    return { item: sanitizeClient(row), clientSecret: plainSecret }
  },

  async update(event: H3Event) {
    await requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!id) throw badRequest('Invalid client id')
    const existing = await findClientById(id)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'OAuth client not found' })

    const body = await readBody<Record<string, unknown>>(event) ?? {}
    const patch: Partial<typeof oauthClients.$inferInsert> = { updatedAt: new Date() }

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) throw badRequest('Application name is required')
      if (name.length > 100) throw badRequest('Application name must be at most 100 chars')
      patch.name = name
    }
    if (body.description !== undefined) patch.description = optionalText(body.description)
    if (body.homepageUrl !== undefined) patch.homepageUrl = optionalText(body.homepageUrl)
    if (body.logoUrl !== undefined) patch.logoUrl = optionalText(body.logoUrl)
    if (body.redirectUris !== undefined) patch.redirectUris = validateRedirectUris(body.redirectUris)
    if (body.scopes !== undefined) patch.scopes = validateScopes(body.scopes)
    if (body.isActive !== undefined) patch.isActive = body.isActive === true || body.isActive === 'true'
    if (body.accessTokenTtlMinutes !== undefined) {
      patch.accessTokenTtlMinutes = intInRange(body.accessTokenTtlMinutes, existing.accessTokenTtlMinutes, 5, 1440)
    }
    if (body.refreshTokenTtlDays !== undefined) {
      patch.refreshTokenTtlDays = intInRange(body.refreshTokenTtlDays, existing.refreshTokenTtlDays, 1, 365)
    }

    const isPublic = body.isPublic === undefined ? existing.isPublic : body.isPublic === true || body.isPublic === 'true'
    patch.isPublic = isPublic

    // `clientSecret` is not part of the form (it never exists in the DB in
    // plaintext); a new secret is only generated when a client switches from
    // public to confidential and has none yet.
    let plainSecret: string | null = null
    if (isPublic) {
      patch.clientSecretHash = null
    } else if (!existing.clientSecretHash) {
      plainSecret = generateClientSecret()
      patch.clientSecretHash = hashOAuthToken(plainSecret)
    }

    const [row] = await db.update(oauthClients).set(patch).where(eq(oauthClients.id, id)).returning()
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'OAuth client not found' })

    return { item: sanitizeClient(row), clientSecret: plainSecret }
  }
}

export default handler
