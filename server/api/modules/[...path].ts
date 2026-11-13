// Generic module API dispatcher: /api/modules/<module>/<route>.
// Authentication happens once here; every module definition re-authorizes and
// receives the resolved organization scope (never a client-supplied org ID).
import { createError, getMethod, getQuery, getRouterParam, readBody } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { ModuleForbiddenError } from '~~/server/core/moduleSdk'
import { isModuleStateUnavailable } from '~~/server/core/moduleGuards'
import { moduleApiRouter, registerEnabledModuleServices } from '~~/server/utils/moduleRuntime'
import { db } from '~~/server/database'
import { findModuleState } from '~~/server/database/moduleStates'

export default defineEventHandler(async (event) => {
  await registerEnabledModuleServices()

  const auth = await requireUser(event)
  const actor = {
    userId: auth.user.id,
    roleName: auth.role?.name,
    permissions: auth.role?.permissions,
    organizationId: auth.organization?.id,
    tenantId: auth.organization?.tenantId
  }

  const path = getRouterParam(event, 'path') ?? ''
  const method = getMethod(event)

  // Runtime availability gate: a module disabled from Module Management is
  // registered (build-time) but must not serve requests until re-enabled.
  const moduleId = path.split('/')[0]
  if (moduleId) {
    const state = await findModuleState(db, moduleId)
    if (isModuleStateUnavailable(state?.state)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: `Module is disabled: ${moduleId}` })
    }
  }

  const input = method === 'GET' || method === 'HEAD' ? getQuery(event) : await readBody(event) ?? {}

  try {
    return await moduleApiRouter.dispatch(method, path, event, actor, input)
  } catch (error) {
    if (error instanceof ModuleForbiddenError) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: error.message })
    }
    if (error instanceof Error && error.message.startsWith('Unknown module API route')) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: error.message })
    }
    if (error instanceof Error && error.message.startsWith('Module API authorization denied')) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: error.message })
    }
    if (error instanceof Error && error.message.startsWith('Invalid input for module API')) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: error.message })
    }
    throw error
  }
})
