/**
 * Public — list published blog posts (with category + author names).
 * No auth: this is the module's own read-only frontend endpoint.
 */
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import { users as usersTable } from '../../../../../server/database/schema'
import { posts, categories } from '../../database/schema'

export interface BlogListItem {
  id: number
  title: string
  slug: string
  excerpt: string | null
  coverUrl: string | null
  publishedAt: Date | null
  category: { id: number, name: string, slug: string } | null
  authorName: string | null
}

export default defineEventHandler(async (): Promise<BlogListItem[]> => {
  return await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      coverUrl: posts.coverUrl,
      publishedAt: posts.publishedAt,
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
    .where(and(eq(posts.status, 'published'), isNull(posts.deletedAt)))
    .orderBy(desc(posts.publishedAt))
})