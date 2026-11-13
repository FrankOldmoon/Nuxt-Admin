import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { resolveModules, runModuleLifecycle } from '../core/moduleSdk'
import { MODULE_DEFINITIONS, parseEnabledModuleIds } from '../core/moduleCatalog'
import { schema } from './index'
import { applyModuleMigrations } from './moduleMigrations'
import { runBlogMigrations } from '../../extends/blog/server/database/migrate'

/**
 * Single pre-release migration entry point. Application instances never run
 * this; run `pnpm db:migrate:release` once before deploying.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const resolved = resolveModules(MODULE_DEFINITIONS, parseEnabledModuleIds())
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema })
  try {
    await migrate(db, { migrationsFolder: './server/database/migrations' })
    await runModuleLifecycle(resolved.modules, resolved.enabledIds, 'onRegister')
    await runModuleLifecycle(resolved.modules, resolved.enabledIds, 'onEnable')
    await applyModuleMigrations(pool, resolved.modules)
    if (process.env.BLOG_ENABLED !== 'false') {
      await runBlogMigrations(pool)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('[migration] Failed:', error)
  process.exitCode = 1
})
