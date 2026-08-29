/**
 * Blog module — Nitro plugin.
 *
 * Runs once at server startup and plugs the module into the host project:
 *   1. Registers the blog Drizzle schema with the dashboard auto-discovery.
 *   2. Runs the module's own idempotent DB migrations.
 *   3. Registers the `posts` / `categories` tables into the host's generic
 *      dashboard CRUD (making them editable at `/dashboard/posts`, …).
 *   4. Adds default sidebar menu entries (merged into the shared
 *      `configs.dashboard.menu` whitelist).
 *   5. Seeds a sample category + post when the tables are empty.
 *
 * Everything blog-specific lives in this module; the host only exposes the
 * generic `register*` extension points (imported via a path into the host's
 * server/ directory — the intended blog→host seam).
 */
import { eq } from 'drizzle-orm'
import { db } from '../../../../server/database'
import { configs as configsTable, roles as rolesTable } from '../../../../server/database/schema'
import { getConfigValue } from '../../../../server/utils/configs'
import {
  registerDrizzleSchema,
  registerDashboardTable,
  DEFAULT_MENU
} from '../../../../server/utils/dashboard/tables'
import * as blogSchema from '../database/schema'
import { runBlogMigrations } from '../database/migrate'
import { postMeta, categoryMeta } from '../utils/fields'

const DASHBOARD_MENU_KEY = 'dashboard.menu'
const BLOG_ENABLED_KEY = 'blog.enabled'

export default defineNitroPlugin(async () => {
  // Master switch — controlled from the host's System Config > General
  // (`blog.enabled`). When disabled, the blog registers nothing (no schema,
  // migrations, tables, menu entries or seed data). Safe to boot either way;
  // this keeps the config from ever loading a module the admin turned off.
  const enabled = await getConfigValue(BLOG_ENABLED_KEY, true).catch(() => true)
  if (!enabled) {
    console.log('[blog] disabled via config (blog.enabled=false) — skipping setup')
    return
  }

  console.log('[blog] initializing blog module')

  // 1. Make the blog tables discoverable by the generic dashboard.
  registerDrizzleSchema(blogSchema)

  // 2. Create/upgrade the blog tables (idempotent).
  await runBlogMigrations()

  // 2b. Ensure the `author` role exists (idempotent) so authors can manage
  //     their own posts via the dashboard RBAC.
  await ensureAuthorRole()

  // 3. Register the tables into the host CRUD + admin sidebar menu.
  registerDashboardTable(
    { meta: postMeta, getTable: () => blogSchema.posts },
    { menuOrder: 70 }
  )
  registerDashboardTable(
    { meta: categoryMeta, getTable: () => blogSchema.categories },
    { menuOrder: 80 }
  )

  // 4. Merge the module's menu entries into the persisted `dashboard.menu`
  //    whitelist. This is non-intrusive: existing rows (labels/icons/order/
  //    admin customizations) are preserved, and only entries that are part of
  //    `DEFAULT_MENU` (which now includes posts/categories) get added when
  //    missing. When no menu has been configured yet we initialize from the
  //    full DEFAULT_MENU so the sidebar is complete regardless of boot order.
  await ensureMenu()

  // 5. Seed sample data when the blog is empty (idempotent).
  await seedDefaults()
})

async function ensureAuthorRole(): Promise<void> {
  try {
    const existing = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, 'author'))
      .limit(1)
    if (existing.length > 0) return

    await db.insert(rolesTable).values({
      name: 'author',
      description: 'Blog author — manages their own posts',
      permissions: ['posts:read', 'posts:create', 'posts:update', 'posts:delete', 'categories:read'],
      dataScope: 'self'
    })
    console.log('[blog] ensured author role')
  } catch (e) {
    console.warn('[blog] ensure author role failed (ignored):', e)
  }
}

async function ensureMenu(): Promise<void> {
  try {
    const rows = await db
      .select({ value: configsTable.value })
      .from(configsTable)
      .where(eq(configsTable.key, DASHBOARD_MENU_KEY))

    let list: Array<{ table: string; label?: unknown; icon?: unknown; order?: unknown; hidden?: unknown }> = []
    const raw = rows[0]?.value
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) list = parsed
      } catch {
        list = []
      }
    }

    let changed = false
    if (list.length === 0) {
      // No menu configured yet — seed it from the full default list.
      list = DEFAULT_MENU.map(m => ({ table: m.table, label: m.label, icon: m.icon, order: m.order }))
      changed = true
    } else {
      const known = new Set(list.map(i => i.table))
      for (const m of DEFAULT_MENU) {
        if (!known.has(m.table)) {
          list.push({ table: m.table, label: m.label, icon: m.icon, order: m.order })
          changed = true
        }
      }
    }

    if (changed) {
      await db
        .insert(configsTable)
        .values({
          key: DASHBOARD_MENU_KEY,
          value: JSON.stringify(list),
          type: 'json',
          description: 'Dashboard left-sidebar menu config (JSON array)',
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: configsTable.key,
          set: { value: JSON.stringify(list), updatedAt: new Date() }
        })
      console.log('[blog] dashboard menu updated')
    }
  } catch (e) {
    console.warn('[blog] menu ensure failed (ignored):', e)
  }
}

async function seedDefaults(): Promise<void> {
  try {
    const existing = await db
      .select({ id: blogSchema.categories.id })
      .from(blogSchema.categories)
      .limit(1)
    if (existing.length > 0) return

    const [category] = await db
      .insert(blogSchema.categories)
      .values({ name: 'News', url: 'news', description: 'Latest updates from the project.' })
      .returning({ id: blogSchema.categories.id })
    if (!category) return

    await db.insert(blogSchema.posts).values({
      title: 'Welcome to the Blog module',
      url: 'welcome-to-the-blog-module',
      excerpt: 'A fully self-contained Nuxt layer that plugs into the generic dashboard.',
      contentMarkdown: `This is **blog** — an example of an independent module.

It owns its own pages, API, database tables, migrations and i18n, and registers its tables into the host's generic CRUD dashboard.`,
      status: 'published',
      categoryId: category.id,
      publishedAt: new Date()
    })
    console.log('[blog] seeded sample category + post')
  } catch (e) {
    console.warn('[blog] seed failed (ignored):', e)
  }
}