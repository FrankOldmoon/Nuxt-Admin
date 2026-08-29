/**
 * Public — fetch a single published post by slug (with category + author).
 * Returns 404 when the post is missing, still a draft, or soft-deleted.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../../server/database'
import { users as usersTable } from '../../../../../../server/database/schema'
import { posts, categories } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  const row = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      contentMarkdown: posts.contentMarkdown,
      coverUrl: posts.coverUrl,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug
      },
      authorName: usersTable.name
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .leftJoin(usersTable, eq(posts.authorId, usersTable.id))
    .where(and(eq(posts.slug, slug), eq(posts.status, 'published'), isNull(posts.deletedAt)))

  if (!row[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }
  return row[0]
})