import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../../../../server/database'
import {
  applyModuleMigrations,
  moduleMigrationChecksum
} from '../../../../server/database/moduleMigrations'
import type { ModuleDefinition, ModuleMigration } from '../../../../server/core/moduleSdk'

describe('module migration checksums', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const migrationId = `itest-checksum-${suffix}`
  const tableName = `itest_checksum_${suffix.replace(/-/g, '_')}`

  function definition(migration: ModuleMigration): ModuleDefinition {
    return {
      id: 'itest-checksum',
      name: 'Checksum test',
      version: '1.0.0',
      dependencies: [],
      permissions: [],
      navigation: [],
      database: [],
      api: [],
      tools: [],
      components: [],
      migrations: [migration]
    }
  }

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS "${tableName}"`)
    await pool.query(`DELETE FROM "__module_migrations" WHERE "id" LIKE $1`, [`itest-checksum-${suffix}%`])
    await pool.end()
  })

  it('records a checksum once and rejects a changed migration revision', async () => {
    const create = async (executor: unknown) => {
      const client = executor as { query: (sql: string) => Promise<unknown> }
      await client.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (id serial PRIMARY KEY)`)
    }
    await applyModuleMigrations(pool, [definition({ id: migrationId, checksum: '1', up: create })])
    // Re-running the identical migration is a no-op.
    await applyModuleMigrations(pool, [definition({ id: migrationId, checksum: '1', up: create })])

    const { rows } = await pool.query('SELECT "checksum" FROM "__module_migrations" WHERE "id" = $1', [migrationId])
    expect(rows[0]?.checksum).toBe(moduleMigrationChecksum({ id: migrationId, checksum: '1', up: create }))
    expect(rows[0]?.checksum.startsWith('v2:')).toBe(true)

    const modified: ModuleMigration = {
      id: migrationId,
      checksum: '2',
      up: async (executor: unknown) => {
        const client = executor as { query: (sql: string) => Promise<unknown> }
        await client.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS note text`)
      }
    }
    await expect(applyModuleMigrations(pool, [definition(modified)]))
      .rejects.toThrow(`Module migration ${migrationId} changed after it was applied (checksum mismatch)`)
  })

  it('rejects migrations without a declared checksum revision', async () => {
    const badId = `${migrationId}-missing-checksum`
    await expect(applyModuleMigrations(pool, [definition({ id: badId, up: async () => {} } as unknown as ModuleMigration)]))
      .rejects.toThrow(`Module migration ${badId} must declare a checksum revision`)
  })

  it('records execution failures and retries them', async () => {
    const failedId = `${migrationId}-retry`
    let shouldFail = true
    const up = async () => {
      if (shouldFail) throw new Error('migration boom')
    }

    await expect(applyModuleMigrations(pool, [definition({ id: failedId, checksum: '1', up })]))
      .rejects.toThrow('migration boom')
    const failed = await pool.query(
      'SELECT "status", "module_id", "module_version", "last_error" FROM "__module_migrations" WHERE "id" = $1',
      [failedId]
    )
    expect(failed.rows[0]).toMatchObject({
      status: 'failed',
      module_id: 'itest-checksum',
      module_version: '1.0.0',
      last_error: 'migration boom'
    })

    shouldFail = false
    await applyModuleMigrations(pool, [definition({ id: failedId, checksum: '1', up })])
    const applied = await pool.query(
      'SELECT "status", "duration_ms", "last_error" FROM "__module_migrations" WHERE "id" = $1',
      [failedId]
    )
    expect(applied.rows[0].status).toBe('applied')
    expect(applied.rows[0].last_error).toBeNull()
    expect(typeof applied.rows[0].duration_ms).toBe('number')
  })
})
