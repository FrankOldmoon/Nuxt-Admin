import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { getConfigValue } from './configs'
import { resolveSiteOriginValue } from './siteOrigin'

/**
 * Canonical origin for absolute URLs (sitemap, robots, payment callbacks).
 * `site.url` wins because proxies and internal health checks may reach the
 * server through a different host name.
 */
export async function resolveSiteOrigin(event: H3Event): Promise<string> {
  const configured = await getConfigValue<string>('site.url', '').catch(() => '')
  return resolveSiteOriginValue(configured, getRequestURL(event).origin)
}
