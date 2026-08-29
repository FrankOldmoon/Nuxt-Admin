/**
 * Public — list published categories (with post counts) for the blog filter bar.
 * No auth: read-only frontend endpoint.
 */
import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { db } from '../../../../../server/database'
import { posts, categories } from '../../database/schema'

export interface BlogCategoryItem {
  id: number
  name: string
  url: string
  description: string | null
  postCount: number
}

export default defineEventHandler(async (): Promise<BlogCategoryItem[]> => {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      url: categories.url,
      description: categories.description,
      postCount: count(posts.id)
    })
    .from(categories)
    .leftJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.status, 'published'), isNull(posts.deletedAt)))
    .groupBy(categories.id, categories.name, categories.url, categories.description)
    .orderBy(asc(categories.name))

  return rows
})