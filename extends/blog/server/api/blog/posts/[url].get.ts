/**
 * Public — fetch a single post by url (with category + author).
 * - Everyone can read `published` posts.
 * - Users whose role has `posts` access (author/admin) can also preview
 *   `draft` / `archived` posts.
 * Returns 404 when the post is missing, soft-deleted, or the caller is not
 * allowed to view a draft/archived post.
 * Also returns `prev` / `next` for n.-1/n.+1 navigation (#9).
 */
import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { db } from '~~/server/database'
import { users as usersTable } from '../../../../../../server/database/schema'
import { posts, categories } from '../../../database/schema'
import { getSessionUser, roleCanTableAction } from '../../../../../../server/utils/auth'

export default defineEventHandler(async (event) => {
  const url = getRouterParam(event, 'url')
  if (!url) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

  // Determine whether the caller may read drafts (author/admin with posts access).
  const ctx = await getSessionUser(event)
  const canReadPosts = !!ctx && roleCanTableAction(ctx.role?.permissions, 'posts', 'read')

  const statusClause = canReadPosts
    ? undefined // authors/admins may view any non-deleted status
    : eq(posts.status, 'published')

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      url: posts.url,
      excerpt: posts.excerpt,
      content: posts.content,
      coverUrl: posts.coverUrl,
      tags: posts.tags,
      status: posts.status,
      viewCount: posts.viewCount,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
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
    .where(and(eq(posts.url, url), statusClause, isNull(posts.deletedAt)))

  if (!rows[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }
  const post = rows[0]
  const postId = post.id as number

  // ---- #9 prev/next navigation (published posts only, public) ----
  const viewableWhere = and(eq(posts.status, 'published'), isNull(posts.deletedAt))
  const [[prev], [next]] = await Promise.all([
    db
      .select({ id: posts.id, title: posts.title, url: posts.url })
      .from(posts)
      .where(and(viewableWhere, lt(posts.id, postId)))
      .orderBy(desc(posts.id))
      .limit(1),
    db
      .select({ id: posts.id, title: posts.title, url: posts.url })
      .from(posts)
      .where(and(viewableWhere, gt(posts.id, postId)))
      .orderBy(asc(posts.id))
      .limit(1)
  ])

  // Count this view (best-effort, non-blocking).
  await bumpViewCount(postId)

  return {
    ...post,
    prev: prev ?? null,
    next: next ?? null
  }
})

// ---- Increment view count for a served post (fire-and-forget) ----
async function bumpViewCount(id: number): Promise<void> {
  try {
    await db
      .update(posts)
      .set({ viewCount: sql`${posts.viewCount} + 1` })
      .where(eq(posts.id, id))
  } catch { /* view count is best-effort; never fail a page load over it */ }
}