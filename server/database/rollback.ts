import 'dotenv/config'
import { Pool } from 'pg'
import { resolveModuleCatalog } from '../core/moduleCatalog'
import { MODULE_DEFINITIONS, resolveEnabledModuleIds } from '../../modules.catalog'
import { listRollbackCandidates, rollbackModuleMigration } from './moduleMigrations'

/**
 * Manual module-migration rollback.
 *
 *   pnpm db:rollback:module --list
 *   pnpm db:rollback:module sms:004-academic-domain
 *
 * Only migrations that declare a `down` handler are eligible; the bookkeeping
 * row is removed in the same transaction as the reverse DDL.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const resolved = resolveModuleCatalog(MODULE_DEFINITIONS, resolveEnabledModuleIds())
  const pool = new Pool({ connectionString })
  try {
    const arg = process.argv[2]?.trim()
    if (!arg || arg === '--list') {
      const candidates = await listRollbackCandidates(pool, resolved.modules)
      if (candidates.length === 0) {
        console.log('[rollback] No applied migrations declare a down handler.')
        return
      }
      console.log('[rollback] Rollback candidates:')
      for (const item of candidates) {
        console.log(`  - ${item.id} (module: ${item.moduleId || 'unknown'})`)
      }
      return
    }

    await rollbackModuleMigration(pool, resolved.modules, arg)
    console.log(`[rollback] Rolled back ${arg}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('[rollback] Failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
