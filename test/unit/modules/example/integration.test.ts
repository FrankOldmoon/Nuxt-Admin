// Database-backed integration test for the example module:
//   1. notes are isolated per organization,
//   2. a failed audit write rolls the business insert back (same transaction).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../../../../server/database'
import { applyModuleMigrations } from '../../../../server/database/moduleMigrations'
import { MODULE_DEFINITIONS } from '../../../../server/core/moduleCatalog'
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

  it('writes a create audit row for the same organization', async () => {
    const result = await pool.query(
      `SELECT action, resource FROM audit_logs WHERE organization_id = $1 AND resource = 'example_notes'`,
      [orgA]
    )
    expect(result.rows).toContainEqual({ action: 'create', resource: 'example_notes' })
  })
})
