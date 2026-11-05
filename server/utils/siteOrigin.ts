/** Normalize the configured canonical site origin, falling back to the request origin. */
export function resolveSiteOriginValue(configured: string, requestOrigin: string): string {
  const trimmed = configured.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return requestOrigin.replace(/\/+$/, '')
}
