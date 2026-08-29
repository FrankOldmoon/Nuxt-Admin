import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from '../database'
import { ensureDatabase } from '../database/ensure'
import { seed } from '../database/seed'
import { configs as configsTable, roles as rolesTable } from '../database/schema'
import { eq } from 'drizzle-orm'
import * as mainSchema from '../database/schema'
import { registerDrizzleSchema } from '../utils/dashboard/tables'

const DEFAULT_DASHBOARD_MENU = [
  { table: 'roles', label: 'Roles', icon: 'i-lucide-shield', order: 10 },
  { table: 'users', label: 'Users', icon: 'i-lucide-users', order: 20 },
  { table: 'files', label: 'Files', icon: 'i-lucide-folder-open', order: 30 },
  { table: 'notifications', label: 'Notifications', icon: 'i-lucide-bell-ring', order: 40 },
  { table: 'templates', label: 'Templates', icon: 'i-lucide-file-text', order: 50 },
  { table: 'configs', label: 'System Config', icon: 'i-lucide-settings-2', order: 60 }
]

export default defineNitroPlugin(async () => {
  // Register the main project Drizzle schema export with the dashboard's
  // auto-discovery system BEFORE we start serving requests.  Any new table
  // added to `server/database/schema.ts` (with `pnpm db:migrate`) will then
  // automatically become editable via `/dashboard/<table>` without writing
  // a single line of FieldMeta or API glue code.
  registerDrizzleSchema(mainSchema)

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('[database] DATABASE_URL is not set')
    throw new Error('DATABASE_URL is not set')
  }

  // Auto-migrate in dev for convenience; in production require explicit
  // AUTO_MIGRATE=true so deploy pipelines can run `pnpm db:migrate` separately.
  const autoMigrate = process.env.NODE_ENV !== 'production' || process.env.AUTO_MIGRATE === 'true'

  try {
    if (autoMigrate) {
      // 1. Create the target database if it doesn't exist
      await ensureDatabase(connectionString)

      // 2. Apply pending migrations (equivalent to `pnpm db:migrate`)
      await migrate(db, {
        migrationsFolder: './server/database/migrations',
        migrationsSchema: 'public',
        migrationsTable: '__drizzle_migrations'
      })
      console.log('[database] Migrations applied successfully')
    } else {
      console.log('[database] AUTO_MIGRATE not enabled; skipping migrations (run `pnpm db:migrate` in deploy pipeline)')
    }

    // 3. Seed initial data (idempotent: upserts configs, skips roles/users if present)
    await seed(db)

    // 3b. Ensure dashboard.menu config exists on every startup.
    // This runs AFTER the seed so it always injects the default value
    // into existing/old databases that were seeded before this row was added.
    // onConflictDoUpdate preserves existing user customizations — only
    // missing rows get the default JSON.
    try {
      await db.insert(configsTable)
        .values({
          key: 'dashboard.menu',
          value: JSON.stringify(DEFAULT_DASHBOARD_MENU),
          type: 'json',
          description: 'Dashboard left-sidebar menu config (JSON array; elements contain table/label/icon/order/hidden)',
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: configsTable.key,
          // Only write when the row does NOT already exist (i.e. nothing to
          // update): onConflictDoUpdate semantics require at least one column
          // update so we set updatedAt (which matches current timestamp for a
          // brand-new row either way) but leave value untouched.
          set: { updatedAt: new Date() }
        })
      console.log('[dashboard] menu config ensured')
    } catch (e) {
      console.warn('[dashboard] menu config ensure failed (ignored):', e)
    }

    // 3c. Backfill admin role with full permissions (['*']) every boot —
    // the admin role always retains full dashboard access.
    try {
      await db.update(rolesTable).set({ permissions: ['*'] }).where(eq(rolesTable.name, 'admin'))
      console.log('[dashboard] admin role permissions ensured')
    } catch (e) {
      console.warn('[dashboard] admin role permissions ensure failed (ignored):', e)
    }

    // 4. Verify the connection (use try/finally to ensure client is released even on error)
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
    } finally {
      client.release()
    }
    console.log('[database] Connection established')
  } catch (error) {
    console.error('[database] Initialization failed:', error)
    throw error
  }
})
