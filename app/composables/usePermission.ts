import { authorize, permMatches, type ResourceRef, type TableAction } from '~~/server/core/permissions'

export { permMatches }
export type { TableAction }

/** Accept metadata so module canonical permissions match the server guard. */
export function usePermission() {
  const { user } = useAuth()
  const isAdmin = computed(() => user.value?.role?.name === 'admin')
  function can(resource: string | Omit<ResourceRef, 'action'>, action?: TableAction): boolean {
    if (!user.value) return false
    return authorize({
      userId: user.value.id,
      roleName: user.value.role?.name,
      permissions: user.value.role?.permissions
    }, { ...(typeof resource === 'string' ? { table: resource } : resource), action }).allowed
  }
  return { isAdmin, can }
}
