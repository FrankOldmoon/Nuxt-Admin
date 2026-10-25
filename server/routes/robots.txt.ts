import { setHeader } from 'h3'
import { resolveSiteOrigin } from '../utils/sitemap'

/**
 * GET /robots.txt
 *
 * Public catalog, tool pages, blog and membership are crawlable; everything
 * behind a login (or that only makes sense with one) is not. These paths also
 * send `noindex` in their own HTML — robots.txt alone does not remove a page
 * that is already indexed.
 */
const DISALLOW = [
  '/api/',
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/credits',
  '/messages',
  '/notifications',
  '/profile',
  '/oauth/',
  '/request-account',
  '/files/',
  '/test'
]

export default defineEventHandler(async (event) => {
  const origin = await resolveSiteOrigin(event)

  const lines = [
    'User-Agent: *',
    'Allow: /',
    ...DISALLOW.map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    ''
  ]

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return lines.join('\n')
})
