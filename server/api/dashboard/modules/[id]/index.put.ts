// PUT /api/dashboard/modules/:id
// Admin-only module lifecycle operations. All state changes go through the
// server-side lifecycle service (`recordModuleState`), which enforces the
// transition graph and writes an audit entry.
import { createError, getRouterParam, readBody } from 'h3'
import { requireAdmin } from '~~/server/utils/auth'
import { MODULE_DEFINITIONS } from '~~/modules.catalog'
import { validateModuleManifests } from '~~/server/core/moduleManifest'
import { activeDependents } from '~~/server/core/moduleGuards'
import { db } from '~~/server/database'
import { moduleStates } from '~~/server/database/schema'
import { findModuleState, recordModuleState } from '~~/server/database/moduleStates'

type ModuleAction = 'validate' | 'enable' | 'disable' | 'uninstall'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const moduleId = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ action?: ModuleAction, confirm?: string }>(event)
  const action = body?.action
  if (action !== 'validate' && action !== 'enable' && action !== 'disable' && action !== 'uninstall') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'action must be validate, enable, disable or uninstall' })
  }

  if (action === 'validate') {
    try {
      validateModuleManifests(MODULE_DEFINITIONS)
    } catch (error) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Unprocessable Entity',
        message: error instanceof Error ? error.message : String(error)
      })
    }
    return { ok: true, moduleId }
  }

  const module = MODULE_DEFINITIONS.find(definition => definition.id === moduleId)
  if (!module) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Unknown module: ${moduleId}` })
  }

  const current = await findModuleState(db, module.id)
  if (!current) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: 'Module has not been installed or migrated yet'
    })
  }

  if (action === 'uninstall') {
    // Explicit confirmation prevents accidental destructive-looking calls.
    if (body?.confirm !== module.id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: `confirm must equal the module id (${module.id})`
      })
    }
    if (current.state !== 'deactivated' && current.state !== 'uninstalling') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: `Module must be deactivated before uninstall (current: ${current.state})`
      })
    }
    const states = new Map(
      (await db.select({ moduleId: moduleStates.moduleId, state: moduleStates.state }).from(moduleStates))
        .map(row => [row.moduleId, row.state])
    )
    const dependents = activeDependents(MODULE_DEFINITIONS, module.id, id => states.get(id))
    if (dependents.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: `Cannot uninstall ${module.id}; active dependent modules: ${dependents.join(', ')}`
      })
    }

    // Business data is preserved: uninstall only changes lifecycle metadata and
    // never drops module tables (the task book forbids silent data deletion).
    if (current.state === 'deactivated') {
      await recordModuleState(db, {
        moduleId: module.id,
        version: module.version,
        state: 'uninstalling',
        source: `admin:${admin.user.id}`
      })
    }
    await recordModuleState(db, {
      moduleId: module.id,
      version: module.version,
      state: 'uninstalled',
      source: `admin:${admin.user.id}`
    })
    return { ok: true, moduleId, state: 'uninstalled' }
  }

  if (action === 'disable') {
    if (current.state === 'deactivated') return { ok: true, moduleId, state: current.state }
    if (current.state !== 'active') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: `Only active modules can be disabled (current: ${current.state})`
      })
    }
    await recordModuleState(db, {
      moduleId: module.id,
      version: module.version,
      state: 'deactivated',
      source: `admin:${admin.user.id}`
    })
    return { ok: true, moduleId, state: 'deactivated' }
  }

  // enable: activation is only allowed after a successful migration.
  if (current.state === 'active') return { ok: true, moduleId, state: 'active' }
  if (current.state !== 'migrated' && current.state !== 'deactivated') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      message: `Module must complete migration before activation (current: ${current.state})`
    })
  }
  await recordModuleState(db, {
    moduleId: module.id,
    version: module.version,
    state: 'active',
    source: `admin:${admin.user.id}`
  })
  return { ok: true, moduleId, state: 'active' }
})
