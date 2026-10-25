import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { getConfigValue } from './configs'

/**
 * Sitemap plumbing.
 *
 * The host owns `/sitemap.xml`, but it must not know which extension layers are
 * installed: a module (e.g. the teacher tools) registers a provider at boot and
 * the route merges every provider into one document. Entries are paths, not
 * absolute URLs, so the same build works on localhost, staging and production.
 */
export interface SitemapEntry {
  /** Path under the site root (`/tools/pdf-merge`) or an absolute URL. */
  loc: string
  lastmod?: string | Date
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

type SitemapProvider = () => SitemapEntry[] | Promise<SitemapEntry[]>

const providers: SitemapProvider[] = []

/** Called once from a Nitro plugin; providers may query the database. */
export function registerSitemapProvider(provider: SitemapProvider): void {
  providers.push(provider)
}

/**
 * Canonical origin for absolute URLs (sitemap, robots). `site.url` wins because
 * proxies and health checks often reach the server through an internal host
 * name; without it the sitemap would advertise `http://127.0.0.1:3000`.
 */
export async function resolveSiteOrigin(event: H3Event): Promise<string> {
  const configured = await getConfigValue<string>('site.url', '').catch(() => '')
  const trimmed = configured.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return getRequestURL(event).origin
}

/** Merge providers, dropping duplicates (first entry wins) and broken paths. */
export async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const byLoc = new Map<string, SitemapEntry>()
  for (const provider of providers) {
    try {
      for (const entry of await provider()) {
        if (!entry?.loc || byLoc.has(entry.loc)) continue
        byLoc.set(entry.loc, entry)
      }
    } catch (error) {
      console.warn('[sitemap] provider failed (ignored):', error)
    }
  }
  return [...byLoc.values()]
}
