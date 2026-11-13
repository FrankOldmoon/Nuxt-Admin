import { eq } from 'drizzle-orm'
import type { Database } from './index'
import { moduleStates } from './schema'
import { writeAudit } from '../core/audit'
import { assertTransition, type ModuleLifecycleState } from '../core/moduleState'

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
 * Transitions are enforced against the persisted state: re-writing the same
 * state is an idempotent no-op, a `failed` module may be retried, and terminal
 * states (e.g. `active`) cannot regress (e.g. back to `migrated`).
 */
export async function recordModuleState(db: Database, entry: ModuleStateEntry): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ state: moduleStates.state })
      .from(moduleStates)
      .where(eq(moduleStates.moduleId, entry.moduleId))
      .limit(1)
    if (current && current.state !== entry.state && current.state !== 'failed') {
      assertTransition(current.state as ModuleLifecycleState, entry.state)
    }

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
