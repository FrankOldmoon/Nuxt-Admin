import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import { runModuleMigrations, type ModuleDefinition, type ModuleMigration } from '../core/moduleSdk'

/**
 * Deterministic checksum of a module migration, derived from the module-declared
 * revision (`checksum`) — never from the function source, which differs between
 * the vitest, dev and bundled production runtimes.
 *
 * Editing an already-applied migration therefore requires bumping `checksum`
 * (and ideally adding a new migration); the stored value then mismatches and
 * the run is rejected instead of being silently skipped.
 */
export function moduleMigrationChecksum(migration: ModuleMigration): string {
  const revision = migration.checksum?.trim()
  if (!revision) throw new Error(`Module migration ${migration.id} must declare a checksum revision`)
  return 'v2:' + createHash('sha256')
    .update(migration.id)
    .update('\n')
    .update(revision)
    .digest('hex')
}

interface MigrationMeta {
  moduleId: string
  moduleVersion: string
  migration: ModuleMigration
}

/** Bootstrap the bookkeeping table once per process (outside migration txns). */
let schemaReady: Promise<void> | null = null
function ensureMigrationTable(pool: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query('CREATE TABLE IF NOT EXISTS "__module_migrations" ("id" varchar(255) PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())')
      await pool.query('ALTER TABLE "__module_migrations" ADD COLUMN IF NOT EXISTS "module_id" varchar(80)')
      await pool.query('ALTER TABLE "__module_migrations" ADD COLUMN IF NOT EXISTS "module_version" varchar(40)')
      await pool.query('ALTER TABLE "__module_migrations" ADD COLUMN IF NOT EXISTS "checksum" varchar(96)')
      await pool.query('ALTER TABLE "__module_migrations" ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT \'applied\'')
      await pool.query('ALTER TABLE "__module_migrations" ADD COLUMN IF NOT EXISTS "duration_ms" integer')
      await pool.query('ALTER TABLE "__module_migrations" ADD COLUMN IF NOT EXISTS "last_error" text')
      // Widen checksums written by the earlier (64-char) scheme.
      await pool.query('ALTER TABLE "__module_migrations" ALTER COLUMN "checksum" TYPE varchar(96)')
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
}

/**
 * Shared module-migration orchestrator used by both the release entry point
 * and the development boot path. Serializes each migration with an advisory
 * lock and records module/version/checksum/status/duration in
 * `__module_migrations`.
 */
export async function applyModuleMigrations(pool: Pool, modules: readonly ModuleDefinition[]): Promise<void> {
  const migrations = modules.flatMap(module => module.migrations ?? [])
  const metaById = new Map<string, MigrationMeta>()
  for (const module of modules) {
    for (const migration of module.migrations ?? []) {
      metaById.set(migration.id, { moduleId: module.id, moduleVersion: module.version, migration })
    }
  }

  await ensureMigrationTable(pool)
  await runModuleMigrations(
    migrations,
    async (id, run) => {
      const meta = metaById.get(id)
      // Compute before acquiring a client: a missing revision must not leak a
      // pooled connection.
      const checksum = meta ? moduleMigrationChecksum(meta.migration) : null
      const client = await pool.connect()
      let executing = false
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`module-migration:${id}`])

        const result = await client.query('SELECT "checksum", "status" FROM "__module_migrations" WHERE "id" = $1', [id])
        const existing = result.rows[0] as { checksum: string | null, status: string } | undefined

        if (existing && existing.status === 'applied') {
          const legacyChecksum = !existing.checksum || !existing.checksum.startsWith('v2:')
          if (!legacyChecksum && checksum && existing.checksum !== checksum) {
            throw new Error(`Module migration ${id} changed after it was applied (checksum mismatch)`)
          }
          // Grandfather rows written by the earlier source-hash scheme, and
          // backfill rows recorded before checksums were introduced.
          if (checksum && existing.checksum !== checksum) {
            await client.query('UPDATE "__module_migrations" SET "checksum" = $2 WHERE "id" = $1', [id, checksum])
          }
        } else {
          // Pending, or a previous attempt failed: (re)run the migration.
          const startedAt = Date.now()
          executing = true
          await run(client)
          const durationMs = Date.now() - startedAt
          await client.query(
            `INSERT INTO "__module_migrations"
               ("id", "module_id", "module_version", "checksum", "status", "duration_ms", "last_error", "applied_at")
             VALUES ($1, $2, $3, $4, 'applied', $5, NULL, now())
             ON CONFLICT ("id") DO UPDATE SET
               "module_id" = EXCLUDED."module_id",
               "module_version" = EXCLUDED."module_version",
               "checksum" = EXCLUDED."checksum",
               "status" = 'applied',
               "duration_ms" = EXCLUDED."duration_ms",
               "last_error" = NULL,
               "applied_at" = now()`,
            [id, meta?.moduleId ?? null, meta?.moduleVersion ?? null, checksum, durationMs]
          )
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        if (executing) {
          const message = error instanceof Error ? error.message : String(error)
          await client.query(
            `INSERT INTO "__module_migrations" ("id", "module_id", "module_version", "checksum", "status", "last_error")
             VALUES ($1, $2, $3, $4, 'failed', $5)
             ON CONFLICT ("id") DO UPDATE SET
               "status" = 'failed',
               "last_error" = EXCLUDED."last_error"`,
            [id, meta?.moduleId ?? null, meta?.moduleVersion ?? null, checksum, message.slice(0, 2000)]
          ).catch(() => {})
        }
        throw error
      } finally {
        client.release()
      }
    },
    pool
  )
}
