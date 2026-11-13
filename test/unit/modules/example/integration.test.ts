// Database-backed integration test for the example module:
//   1. notes are isolated per organization,
//   2. a failed audit write rolls the business insert back (same transaction).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from '../../../../server/database'
import { applyModuleMigrations } from '../../../../server/database/moduleMigrations'
import { findModuleState, recordModuleState } from '../../../../server/database/moduleStates'
import { MODULE_DEFINITIONS } from '../../../../modules.catalog'
import { createNote, listNotes, type ExampleNote } from '../../../../modules/example/server/notes'

describe('example notes organization isolation (database)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let tenantId = 0
  let orgA = 0
  let orgB = 0

  const actor = (organizationId: number) => ({
    userId: 1,
    roleName: 'admin',
    permissions: [],
    organizationId,
    tenantId
  })

  async function noteTitles(organizationId: number): Promise<string[]> {
    const notes = await listNotes(actor(organizationId)) as ExampleNote[]
    return notes.map(note => note.title)
  }

  beforeAll(async () => {
    await applyModuleMigrations(pool, MODULE_DEFINITIONS)
    // The shared test database may predate the module_states migration.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "module_states" (
        "module_id" varchar(80) PRIMARY KEY NOT NULL,
        "version" varchar(40) NOT NULL,
        "state" varchar(20) NOT NULL,
        "last_error" text,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `)

    const tenant = await pool.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      ['itest', `itest-${suffix}`]
    )
    tenantId = tenant.rows[0].id

    const organizations = await pool.query(
      `INSERT INTO organizations (tenant_id, name, slug) VALUES
         ($1, 'Org A', $2),
         ($1, 'Org B', $3)
       RETURNING id`,
      [tenantId, `org-a-${suffix}`, `org-b-${suffix}`]
    )
    orgA = organizations.rows[0].id
    orgB = organizations.rows[1].id

    await createNote(actor(orgA), { title: 'note-a' })
    await createNote(actor(orgB), { title: 'note-b' })
  }, 60000)

  afterAll(async () => {
    if (orgA && orgB) {
      await pool.query('DELETE FROM example_notes WHERE organization_id IN ($1, $2)', [orgA, orgB])
      await pool.query('DELETE FROM audit_logs WHERE organization_id IN ($1, $2)', [orgA, orgB])
      await pool.query('DELETE FROM organizations WHERE id IN ($1, $2)', [orgA, orgB])
    }
    if (tenantId) await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await pool.end()
  })

  it('lists only notes belonging to the actor organization', async () => {
    expect(await noteTitles(orgA)).toEqual(['note-a'])
    expect(await noteTitles(orgB)).toEqual(['note-b'])
  })

  it('rolls the note insert back when the audit row cannot be written', async () => {
    const unknownOrganization = 2_000_000_000
    await expect(createNote(actor(unknownOrganization), { title: 'must-roll-back' })).rejects.toThrow()

    const result = await pool.query(
      'SELECT 1 FROM example_notes WHERE organization_id = $1',
      [unknownOrganization]
    )
    expect(result.rowCount).toBe(0)
  })

  it('persists the module lifecycle state, enforces transitions and audits them', async () => {
    const moduleId = 'itest-example-lifecycle'
    await recordModuleState(db, {
      moduleId,
      version: '1.0.0',
      state: 'migrated',
      source: 'integration-test'
    })
    expect((await findModuleState(db, moduleId))?.state).toBe('migrated')

    await recordModuleState(db, {
      moduleId,
      version: '1.0.0',
      state: 'active',
      source: 'integration-test'
    })
    expect((await findModuleState(db, moduleId))?.state).toBe('active')
    await expect(recordModuleState(db, {
      moduleId,
      version: '1.0.0',
      state: 'migrated',
      source: 'integration-test'
    })).rejects.toThrow('Invalid module lifecycle transition: active -> migrated')

    const audit = await pool.query(
      `SELECT action, resource FROM audit_logs WHERE module_id = $1 AND resource = 'module_states'`,
      [moduleId]
    )
    expect(audit.rows).toContainEqual({ action: 'module.migrated', resource: 'module_states' })
    expect(audit.rows).toContainEqual({ action: 'module.active', resource: 'module_states' })

    await pool.query('DELETE FROM module_states WHERE module_id = $1', [moduleId])
    await pool.query('DELETE FROM audit_logs WHERE module_id = $1', [moduleId])
  })

  it('writes a create audit row for the same organization', async () => {
    const result = await pool.query(
      `SELECT action, resource FROM audit_logs WHERE organization_id = $1 AND resource = 'example_notes'`,
      [orgA]
    )
    expect(result.rows).toContainEqual({ action: 'create', resource: 'example_notes' })
  })
})
