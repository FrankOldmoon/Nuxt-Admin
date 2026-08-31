import type { H3Event } from 'h3'
import { getRequestProtocol } from 'h3'

const COOKIE_NAME = 'session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Only flag the cookie Secure when this request actually ran over HTTPS
    // (TLS socket or x-forwarded-proto: https). Hardcoding to NODE_ENV==='production'
    // breaks plain-HTTP deployments (e.g. an intranet box) — browsers drop a
    // Secure cookie over http, so the session is lost on the next refresh.
    secure: getRequestProtocol(event) === 'https',
    path: '/',
    maxAge: COOKIE_MAX_AGE
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function readSessionToken(event: H3Event): string | undefined {
  return getCookie(event, COOKIE_NAME)
}

/**
 * Read the session token from a raw Request (used by WebSocket upgrades,
 * which receive an UpgradeRequest instead of a full H3Event).
 */
export function readSessionTokenFromRaw(req: { headers: Headers }): string | undefined {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
