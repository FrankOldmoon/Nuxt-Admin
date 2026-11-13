import type { Database } from '../database'
import { auditLogs } from '../database/schema'

/** Executor shared by the pool and a transaction so audit writes stay atomic. */
export type AuditExecutor = Pick<Database, 'insert'>

export type AuditOutcome = 'success' | 'failure'

export interface AuditEntry {
  actorUserId?: number | null
  tenantId?: number | null
  organizationId?: number | null
  moduleId?: string
  action: string
  resource: string
  recordId?: number | string | null
  before?: unknown
  after?: unknown
  source?: string | null
  outcome?: AuditOutcome
}

/** Recursively drop credential-like keys before persisting a snapshot. */
export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditValue)
  if (!value || typeof value !== 'object') return value
  const safe: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/password|token|secret|credential|api.?key/i.test(key)) continue
    safe[key] = redactAuditValue(item)
  }
  return safe
}

function snapshot(value: unknown): Record<string, unknown> | null {
  const safe = redactAuditValue(value)
  return safe && typeof safe === 'object' ? safe as Record<string, unknown> : null
}

/**
 * Append one audit row. Callers must pass the same executor/transaction as the
 * business write so a failing audit rolls the whole operation back.
 */
export async function writeAudit(executor: AuditExecutor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    tenantId: entry.tenantId ?? null,
    organizationId: entry.organizationId ?? null,
    moduleId: entry.moduleId ?? 'core',
    action: entry.action,
    resource: entry.resource,
    recordId: entry.recordId === undefined || entry.recordId === null ? null : String(entry.recordId),
    before: snapshot(entry.before),
    after: snapshot(entry.after),
    source: entry.source ?? null,
    outcome: entry.outcome ?? 'success'
  })
}
