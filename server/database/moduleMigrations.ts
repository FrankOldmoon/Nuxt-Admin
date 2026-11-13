import type { Pool } from 'pg'
import { runModuleMigrations, type ModuleDefinition } from '../core/moduleSdk'

/**
 * Shared module-migration orchestrator used by both the release entry point
 * and the development boot path. Serializes each migration with an advisory
 * lock and records applied IDs in `__module_migrations`.
 */
export async function applyModuleMigrations(pool: Pool, modules: readonly ModuleDefinition[]): Promise<void> {
  await runModuleMigrations(
    modules.flatMap(module => module.migrations ?? []),
    async (id, run) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`module-migration:${id}`])
        await client.query('CREATE TABLE IF NOT EXISTS "__module_migrations" ("id" varchar(255) PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())')
        const result = await client.query('SELECT 1 FROM "__module_migrations" WHERE "id" = $1', [id])
        if (result.rowCount === 0) {
          await run(client)
          await client.query('INSERT INTO "__module_migrations" ("id") VALUES ($1)', [id])
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
    pool
  )
}
