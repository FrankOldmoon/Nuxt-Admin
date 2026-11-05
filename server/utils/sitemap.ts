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

/** Mirrors the locale list in nuxt.config (English has no URL prefix). */
export interface SiteLocale {
  code: string
  prefix: string
}

export const SEO_LOCALES: SiteLocale[] = [
  { code: 'en', prefix: '' },
  { code: 'zh-CN', prefix: '/zh-CN' },
  { code: 'zh-TW', prefix: '/zh-TW' },
  { code: 'ja', prefix: '/ja' },
  { code: 'ko', prefix: '/ko' },
  { code: 'fr', prefix: '/fr' },
  { code: 'es', prefix: '/es' },
  { code: 'de', prefix: '/de' },
  { code: 'ar', prefix: '/ar' }
]

/** Prefix a logical path (`/edu`) for one locale (`/ja/edu`). */
export function localizedSitemapPath(path: string, prefix: string): string {
  if (!prefix) return path
  return path === '/' ? prefix : `${prefix}${path}`
}

/** Called once from a Nitro plugin; providers may query the database. */
export function registerSitemapProvider(provider: SitemapProvider): void {
  providers.push(provider)
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
