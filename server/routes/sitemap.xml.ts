import { setHeader } from 'h3'
import { pool } from '../database'
import { getConfigValue } from '../utils/configs'
import {
  collectSitemapEntries,
  localizedSitemapPath,
  resolveSiteOrigin,
  SEO_LOCALES,
  type SitemapEntry
} from '../utils/sitemap'

/**
 * GET /sitemap.xml — every public, canonical page in every language.
 *
 * Private areas (auth, credits, messages, dashboard) are deliberately absent:
 * they are `noindex` and listed as `Disallow` in robots.txt. Duplicate routes
 * (`/tools` renders the same catalog as `/`) are omitted too.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function absoluteUrl(origin: string, loc: string): string {
  return /^https?:\/\//i.test(loc) ? loc : `${origin}${loc.startsWith('/') ? '' : '/'}${loc}`
}

function lastmod(value: string | Date | undefined): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Published posts, read with raw SQL so the host stays independent of the blog layer. */
async function publishedPosts(): Promise<Array<{ url: string, updated_at: Date | null }>> {
  try {
    const { rows } = await pool.query<{ url: string, updated_at: Date | null }>(
      `select url, coalesce(updated_at, published_at) as updated_at
         from posts
        where status = 'published' and deleted_at is null
        order by coalesce(published_at, created_at) desc
        limit 1000`
    )
    return rows
  } catch (error) {
    console.warn('[sitemap] blog posts unavailable (ignored):', error)
    return []
  }
}

export default defineEventHandler(async (event) => {
  const origin = await resolveSiteOrigin(event)
  const entries: SitemapEntry[] = []

  for (const locale of SEO_LOCALES) {
    entries.push({ loc: localizedSitemapPath('/', locale.prefix), changefreq: 'weekly', priority: 1 })
    entries.push({ loc: localizedSitemapPath('/about', locale.prefix), changefreq: 'monthly', priority: 0.6 })
    entries.push({ loc: localizedSitemapPath('/membership', locale.prefix), changefreq: 'monthly', priority: 0.8 })
  }

  const blogEnabled = await getConfigValue('blog.enabled', true).catch(() => true)
  if (blogEnabled) {
    const posts = await publishedPosts()
    for (const locale of SEO_LOCALES) {
      entries.push({ loc: localizedSitemapPath('/blog', locale.prefix), changefreq: 'weekly', priority: 0.6 })
      for (const post of posts) {
        entries.push({
          // Post URLs are editor-entered and may contain spaces or CJK characters.
          loc: localizedSitemapPath(`/blog/${encodeURIComponent(post.url)}`, locale.prefix),
          lastmod: post.updated_at ?? undefined,
          changefreq: 'monthly',
          priority: 0.5
        })
      }
    }
  }

  entries.push(...await collectSitemapEntries())

  const unique = new Map<string, SitemapEntry>()
  for (const entry of entries) {
    if (entry?.loc && !unique.has(entry.loc)) unique.set(entry.loc, entry)
  }

  const urls = [...unique.values()].map((entry) => {
    const lines = [`    <loc>${escapeXml(absoluteUrl(origin, entry.loc))}</loc>`]
    const modified = lastmod(entry.lastmod)
    if (modified) lines.push(`    <lastmod>${modified}</lastmod>`)
    if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`)
    if (typeof entry.priority === 'number') lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`)
    return `  <url>\n${lines.join('\n')}\n  </url>`
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    ''
  ].join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return xml
})
