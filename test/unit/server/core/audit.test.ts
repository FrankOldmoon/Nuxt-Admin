import { describe, expect, it } from 'vitest'
import { redactAuditValue, writeAudit, type AuditExecutor } from '../../../../server/core/audit'

function captureExecutor() {
  const rows: Array<Record<string, unknown>> = []
  const executor = {
    insert: () => ({
      values: async (value: Record<string, unknown>) => { rows.push(value) }
    })
  } as unknown as AuditExecutor
  return { executor, rows }
}

describe('redactAuditValue', () => {
  it('removes credential-like keys recursively while keeping other fields', () => {
    const safe = redactAuditValue({
      id: 1,
      password: 'secret',
      profile: { apiKey: 'k', token: 't', name: 'Alice' },
      items: [{ clientSecret: 's', label: 'a' }]
    }) as Record<string, unknown>

    expect(safe).toEqual({
      id: 1,
      profile: { name: 'Alice' },
      items: [{ label: 'a' }]
    })
  })

  it('passes primitives through unchanged', () => {
    expect(redactAuditValue('plain')).toBe('plain')
    expect(redactAuditValue(null)).toBeNull()
    expect(redactAuditValue(3)).toBe(3)
  })
})

describe('writeAudit', () => {
  it('fills defaults and stringifies numeric record IDs', async () => {
    const { executor, rows } = captureExecutor()
    await writeAudit(executor, {
      actorUserId: 7,
      action: 'create',
      resource: 'example_notes',
      recordId: 42,
      after: { id: 42, title: 'Hello', password: 'hidden' }
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorUserId: 7,
      tenantId: null,
      organizationId: null,
      moduleId: 'core',
      action: 'create',
      resource: 'example_notes',
      recordId: '42',
      before: null,
      after: { id: 42, title: 'Hello' },
      source: null,
      outcome: 'success'
    })
  })

  it('persists the caller organization, module and outcome explicitly', async () => {
    const { executor, rows } = captureExecutor()
    await writeAudit(executor, {
      actorUserId: 1,
      tenantId: 2,
      organizationId: 3,
      moduleId: 'example',
      action: 'tool.execute',
      resource: 'example.notes.count',
      source: 'module-tool',
      outcome: 'failure'
    })

    expect(rows[0]).toMatchObject({
      tenantId: 2,
      organizationId: 3,
      moduleId: 'example',
      recordId: null,
      source: 'module-tool',
      outcome: 'failure'
    })
  })
})
