import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AuthContext } from '../utils/auth'

export type FileVisibility = 'public' | 'private'

export interface FileAccessRecord {
  userId: number
  visibility: string | null
  organizationId?: number | null
}

export interface FileAccessActor {
  userId: number
  roleName?: string | null
  permissions?: readonly string[] | null
  organizationId?: number | null
}

/**
 * Centralized private-file authorization. Public files stay servable; private
 * files require the owner, an admin, or an active member of the owning
 * organization holding `files:read`.
 */
export function canAccessPrivateFile(actor: FileAccessActor | null, file: FileAccessRecord): boolean {
  if (file.visibility === 'public') return true
  if (!actor) return false
  if (file.userId === actor.userId) return true
  if (actor.roleName === 'admin') return true
  if (!file.organizationId || actor.organizationId !== file.organizationId) return false
  return (actor.permissions ?? []).some(permission => permission === '*' || permission === 'files:read')
}

export function actorFromAuthContext(ctx: AuthContext | null): FileAccessActor | null {
  if (!ctx) return null
  return {
    userId: ctx.user.id,
    roleName: ctx.role?.name,
    permissions: ctx.permissions,
    organizationId: ctx.organization?.id ?? null
  }
}

function signingSecret(): string {
  const secret = process.env.FILE_SIGNING_SECRET ?? process.env.NUXT_SESSION_PASSWORD
  if (!secret) {
    throw new Error('FILE_SIGNING_SECRET (or NUXT_SESSION_PASSWORD) is required for signed file URLs')
  }
  return secret
}

function signatureFor(path: string, expires: number): string {
  return createHmac('sha256', signingSecret()).update(`${path}:${expires}`).digest('base64url')
}

/** Create a temporary signed URL for a private file path. */
export function createSignedFileUrl(path: string, ttlSeconds = 300): string {
  const expires = Math.floor(Date.now() / 1000) + Math.max(1, ttlSeconds)
  return `/api/files/serve/${encodeURI(path)}?expires=${expires}&signature=${signatureFor(path, expires)}`
}

/** Verify an expiry + HMAC pair; fail closed on malformed or expired input. */
export function verifySignedFileUrl(path: string, expiresRaw: unknown, signature: unknown): boolean {
  const expires = Number(expiresRaw)
  if (!Number.isSafeInteger(expires) || typeof signature !== 'string') return false
  if (expires <= Math.floor(Date.now() / 1000)) return false

  let expected: string
  try {
    expected = signatureFor(path, expires)
  } catch {
    return false
  }
  const actual = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}
