import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../../../../server/database'
import { moduleStates } from '../../../../server/database/schema'
import { findModuleState, recordModuleState } from '../../../../server/database/moduleStates'

describe('recordModuleState lifecycle enforcement', () => {
  const prefix = `itest-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  afterAll(async () => {
    await db.delete(moduleStates).where(eq(moduleStates.moduleId, `${prefix}-forward`))
    await db.delete(moduleStates).where(eq(moduleStates.moduleId, `${prefix}-retry`))
    await db.delete(moduleStates).where(eq(moduleStates.moduleId, `${prefix}-uninstall`))
  })

  it('persists forward transitions, allows same-state writes and rejects regressions', async () => {
    const moduleId = `${prefix}-forward`
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'installed' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'migrated' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'active' })
    // Same-state writes are idempotent (boot re-runs record `active`).
    await recordModuleState(db, { moduleId, version: '1.0.1', state: 'active' })

    await expect(recordModuleState(db, { moduleId, version: '1.0.0', state: 'migrated' }))
      .rejects.toThrow('Invalid module lifecycle transition: active -> migrated')

    const current = await findModuleState(db, moduleId)
    expect(current?.state).toBe('active')
    expect(current?.version).toBe('1.0.1')
  })

  it('allows retrying a failed module', async () => {
    const moduleId = `${prefix}-retry`
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'migrated' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'failed', error: 'boom' })
    expect((await findModuleState(db, moduleId))?.state).toBe('failed')

    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'active' })
    const current = await findModuleState(db, moduleId)
    expect(current?.state).toBe('active')
    expect(current?.lastError).toBeNull()
  })

  it('supports the two-step uninstall transition and keeps it terminal', async () => {
    const moduleId = `${prefix}-uninstall`
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'migrated' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'active' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'deactivated' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'uninstalling' })
    await recordModuleState(db, { moduleId, version: '1.0.0', state: 'uninstalled' })
    expect((await findModuleState(db, moduleId))?.state).toBe('uninstalled')

    await expect(recordModuleState(db, { moduleId, version: '1.0.0', state: 'active' }))
      .rejects.toThrow('Invalid module lifecycle transition: uninstalled -> active')
    expect((await findModuleState(db, moduleId))?.state).toBe('uninstalled')
  })
})
