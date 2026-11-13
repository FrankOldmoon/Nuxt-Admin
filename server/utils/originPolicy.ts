/**
 * Origin policy for state-changing requests (CSRF defense in depth).
 *
 * SameSite=Lax already blocks cross-site cookie sending on unsafe methods, but
 * an explicit Origin check protects deployments that relax cookie policies or
 * sit behind misconfigured proxies. Requests without an Origin header (CLI,
 * server-to-server, webhooks) are allowed; cookies are not attached to them by
 * a browser anyway.
 */
export interface OriginPolicyInput {
  origin?: string | null
  host?: string | null
  protocol?: string | null
  /** Optional canonical site URL (e.g. https://example.com). */
  siteUrl?: string | null
}

export function isOriginAllowed(input: OriginPolicyInput): boolean {
  const origin = input.origin?.trim()
  if (!origin) return true

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }

  const allowed = new Set<string>()
  if (input.host) allowed.add(`${input.protocol || 'http'}://${input.host}`)
  if (input.siteUrl) {
    try {
      allowed.add(new URL(input.siteUrl).origin)
    } catch {
      // Ignore malformed configuration rather than opening the check.
    }
  }
  return allowed.has(parsed.origin)
}
