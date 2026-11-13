import { sql } from 'drizzle-orm'
import { db } from '../../../server/database'
import { writeAudit } from '../../../server/sdk'
import { requireOrganization, type ModuleActor } from './context'

export interface ExampleNote {
  id: number
  organizationId: number
  title: string
  body: string | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

const NOTE_COLUMNS = sql`
  id,
  organization_id AS "organizationId",
  title,
  body,
  created_by AS "createdBy",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

function rowsOf<T>(result: unknown): T[] {
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? rows as T[] : []
}

export async function listNotes(actor: ModuleActor): Promise<ExampleNote[]> {
  const organization = requireOrganization(actor)
  const result = await db.execute(sql`
    SELECT ${NOTE_COLUMNS}
    FROM example_notes
    WHERE organization_id = ${organization.id} AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT 100
  `)
  return rowsOf<ExampleNote>(result)
}

export async function countNotes(actor: ModuleActor): Promise<number> {
  const organization = requireOrganization(actor)
  const result = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM example_notes
    WHERE organization_id = ${organization.id} AND deleted_at IS NULL
  `)
  return rowsOf<{ count: number }>(result)[0]?.count ?? 0
}

export async function createNote(actor: ModuleActor, input: { title: string, body?: string }): Promise<ExampleNote> {
  const organization = requireOrganization(actor)
  const title = input.title.trim()
  if (!title || title.length > 160) throw new Error('Note title must be 1-160 characters')
  const body = typeof input.body === 'string' && input.body.trim() ? input.body : null

  return await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      INSERT INTO example_notes (organization_id, title, body, created_by)
      VALUES (${organization.id}, ${title}, ${body}, ${actor.userId})
      RETURNING ${NOTE_COLUMNS}
    `)
    const row = rowsOf<ExampleNote>(result)[0]
    if (!row) throw new Error('Failed to create note')
    await writeAudit(tx, {
      actorUserId: actor.userId,
      tenantId: organization.tenantId,
      organizationId: organization.id,
      moduleId: 'example',
      action: 'create',
      resource: 'example_notes',
      recordId: row.id,
      before: null,
      after: row,
      source: 'module-api'
    })
    return row
  })
}
