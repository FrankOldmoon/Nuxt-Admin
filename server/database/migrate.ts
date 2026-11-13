import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { runModuleLifecycle } from '../core/moduleSdk'
import { resolveModuleCatalog } from '../core/moduleCatalog'
import { MODULE_DEFINITIONS, resolveEnabledModuleIds } from '../../modules.catalog'
import { schema } from './index'
import { applyModuleMigrations } from './moduleMigrations'
import { findModuleState, recordModuleState } from './moduleStates'
import { runBlogMigrations } from '../../extends/blog/server/database/migrate'

/**
 * Single pre-release migration entry point. Application instances never run
 * this; run `pnpm db:migrate:release` once before deploying.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const resolved = resolveModuleCatalog(MODULE_DEFINITIONS, resolveEnabledModuleIds())
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema })
  try {
    await migrate(db, {
      migrationsFolder: './server/database/migrations',
      // Must match drizzle.config.ts and the dev boot plugin, otherwise the
      // release entry and dev mode keep separate migration histories and
      // re-apply migrations that already exist.
      migrationsSchema: 'public',
      migrationsTable: '__drizzle_migrations'
    })
    await runModuleLifecycle(resolved.modules, resolved.enabledIds, 'onRegister')
    await runModuleLifecycle(resolved.modules, resolved.enabledIds, 'onEnable')
    try {
      await applyModuleMigrations(pool, resolved.modules)
      for (const module of resolved.modules) {
        const current = await findModuleState(db, module.id)
        if (current?.state === 'active' || current?.state === 'deactivated') continue
        await recordModuleState(db, {
          moduleId: module.id,
          version: module.version,
          state: 'migrated',
          source: 'release-migration'
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const module of resolved.modules) {
        await recordModuleState(db, {
          moduleId: module.id,
          version: module.version,
          state: 'failed',
          error: message,
          source: 'release-migration'
        }).catch(() => {})
      }
      throw error
    }
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
