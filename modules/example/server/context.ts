import { ModuleForbiddenError, permMatches, type TableAction } from '../../../server/sdk'

/** Actor passed to every module API/tool execution after re-authentication. */
export interface ModuleActor {
  userId: number
  roleName?: string | null
  permissions?: readonly string[] | null
  organizationId?: number | null
  tenantId?: number | null
}

/** Organization scope is mandatory: module data is never global. */
export function requireOrganization(actor: ModuleActor): { id: number, tenantId: number | null } {
  if (!actor.organizationId) {
    throw new ModuleForbiddenError('An active organization context is required for this module')
  }
  return { id: actor.organizationId, tenantId: actor.tenantId ?? null }
}

export function canUseExample(actor: ModuleActor, action: TableAction = 'read'): boolean {
  if (!actor.organizationId) return false
  if (actor.roleName === 'admin') return true
  return (actor.permissions ?? []).some(permission => permMatches(permission, 'example', action))
}
