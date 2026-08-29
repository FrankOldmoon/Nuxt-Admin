/**
 * Blog module — Drizzle schema.
 *
 * All blog tables are defined here and therefore live *only* inside this
 * module. They are registered with the host project's generic dashboard CRUD
 * system from `plugins/blog.ts` via `registerSchema + registerDashboardTable`.
 *
 * `authorId` references the host project's `users` table (imported via a path
 * into the host's server/ directory) — this is the intended seam: a module
 * may reuse the host's existing domains, it never redefines them.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core'
import { users } from '../../../../server/database/schema'

export const categories = pgTable('categories',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('categories_slug_idx').on(t.slug)]
)

export const posts = pgTable('posts',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    excerpt: text('excerpt'),
    contentMarkdown: text('content_markdown'),
    coverUrl: text('cover_url'),
    // Free-form tags, stored as a JSON array of strings (matches the host's
    // `tags` convention so the generic dashboard renders the `tags` field).
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    // draft | published | archived
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft delete — the host generic CRUD detects the `deletedAt` column and
    // automatically enables soft-delete for this table.
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (t) => [
    index('posts_slug_idx').on(t.slug),
    index('posts_status_idx').on(t.status),
    index('posts_category_idx').on(t.categoryId),
    index('posts_author_idx').on(t.authorId)
  ]
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert