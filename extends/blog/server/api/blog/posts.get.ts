/**
 * Public — list blog posts (searchable + paginated, with category and author
 * names). No auth: read-only frontend endpoint.
 *
 * Query params:
 *   ?q=keyword&page=1&pageSize=9&category=news&status=published&sort=viewCount
 *
 * - `status` (default `published`): `published` | `draft` | `archived`
 *   Non-published statuses require a caller whose role has `posts` read access
 *   (author/admin), enforced here.
 * - `sort`: `publishedAt` (default, desc) | `viewCount` (desc)
 */
import { and, count, desc, eq, gte, ilike, isNull, lte, or } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import { users as usersTable } from '../../../../../server/database/schema'
import { posts, categories } from '../../database/schema'
import { getSessionUser, roleCanTableAction } from '../../../../../server/utils/auth'

export interface BlogListItem {
  id: number
  title: string
  url: string
  excerpt: string | null
  coverUrl: string | null
  tags: string[]
  status: 'draft' | 'published' | 'archived'
  viewCount: number
  publishedAt: Date | null
  category: { id: number, name: string, url: string } | null
  authorName: string | null
}

export interface BlogListResult {
  items: BlogListItem[]
  page: number
  pageSize: number
  total: number
}

export default defineEventHandler(async (event): Promise<BlogListResult> => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 9))
  const offset = (page - 1) * pageSize

  const q = String(query.q ?? '').trim()
  const categoryUrl = String(query.category ?? '').trim()

  // Date range filter (uses publishedAt, in YYYY-MM-DD; endDate is inclusive).
  const startDate = String(query.startDate ?? '').trim()
  const endDate = String(query.endDate ?? '').trim()
  const startClause = startDate ? gte(posts.publishedAt, new Date(startDate)) : undefined
  const endClause = endDate ? lte(posts.publishedAt, new Date(`${endDate} 23:59:59`)) : undefined

  // Status filter: published by default. Draft/archived only for authors/admins.
  const ctx = await getSessionUser(event)
  const canReadPosts = !!ctx && roleCanTableAction(ctx.role?.permissions, 'posts', 'read')
  let statusValue = String(query.status ?? 'published').trim()
  if (statusValue !== 'published' && !canReadPosts) {
    statusValue = 'published' // non-admins can only ever see published
  }

  // Sort: publishedAt desc (default) or viewCount desc.
  const sortKey = String(query.sort ?? 'publishedAt')
  const orderByClause = (() => {
    if (sortKey === 'viewCount') return desc(posts.viewCount)
    return desc(posts.publishedAt)
  })()

  const whereClause = and(
    eq(posts.status, statusValue),
    isNull(posts.deletedAt),
    q ? or(ilike(posts.title, `%${q}%`), ilike(posts.excerpt, `%${q}%`)) : undefined,
    categoryUrl ? eq(categories.url, categoryUrl) : undefined,
    startClause,
    endClause
  )

  const [{ total }] = await db
    .select({ total: count() })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(whereClause)

  const items = await db
    .select({
      id: posts.id,
      title: posts.title,
      url: posts.url,
      excerpt: posts.excerpt,
      coverUrl: posts.coverUrl,
      tags: posts.tags,
      status: posts.status,
      viewCount: posts.viewCount,
      publishedAt: posts.publishedAt,
      category: {
        id: categories.id,
        name: categories.name,
        url: categories.url
      },
      authorName: usersTable.name
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .leftJoin(usersTable, eq(posts.authorId, usersTable.id))
    .where(whereClause)
    .orderBy(orderByClause, desc(posts.id))
    .limit(pageSize)
    .offset(offset)

  return { items, page, pageSize, total }
})