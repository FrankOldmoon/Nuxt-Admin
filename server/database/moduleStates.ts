import { eq } from 'drizzle-orm'
import type { Database } from './index'
import { moduleStates } from './schema'
import { writeAudit } from '../core/audit'
import type { ModuleLifecycleState } from '../core/moduleState'

export interface ModuleStateEntry {
  moduleId: string
  version: string
  state: ModuleLifecycleState
  error?: string | null
  source?: string
}

/**
 * Persist a module's lifecycle state and append an audit row in the same
 * transaction, so a failed transition cannot be silently reported as success.
 */
export async function recordModuleState(db: Database, entry: ModuleStateEntry): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(moduleStates)
      .values({
        moduleId: entry.moduleId,
        version: entry.version,
        state: entry.state,
        lastError: entry.error ?? null,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: moduleStates.moduleId,
        set: {
          version: entry.version,
          state: entry.state,
          lastError: entry.error ?? null,
          updatedAt: new Date()
        }
      })

    await writeAudit(tx, {
      moduleId: entry.moduleId,
      action: `module.${entry.state}`,
      resource: 'module_states',
      recordId: entry.moduleId,
      after: { state: entry.state, version: entry.version, error: entry.error ?? null },
      source: entry.source ?? 'module-lifecycle'
    })
  })
}

export async function findModuleState(db: Database, moduleId: string) {
  const [row] = await db.select().from(moduleStates).where(eq(moduleStates.moduleId, moduleId)).limit(1)
  return row ?? null
}
