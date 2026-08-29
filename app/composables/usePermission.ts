/**
 * Frontend button-level permission control.
 * Keeps in sync with permMatches / roleCanTableAction in server/utils/auth.ts:
 *   - '*'           → every table, every action
 *   - 'table'       → every action on that table
 *   - 'table:action'→ a single action on that table (read/create/update/delete)
 * The admin role always has all permissions.
 */
export type TableAction = 'read' | 'create' | 'update' | 'delete'

export function permMatches(perm: string, table: string, action?: TableAction): boolean {
  if (perm === '*') return true
  const idx = perm.indexOf(':')
  if (idx < 0) return perm === table // plain table name → all actions on that table
  const t = perm.slice(0, idx)
  const a = perm.slice(idx + 1)
  if (t !== table) return false
  if (action === undefined) return true // no action specified → table match is enough
  return a === action
}

export function usePermission() {
  const { user } = useAuth()
  const isAdmin = computed(() => user.value?.role?.name === 'admin')

  /** Whether the current user has `action` permission on `table` (no action means any operation on that table). */
  function can(table: string, action?: TableAction): boolean {
    if (isAdmin.value) return true
    const perms = user.value?.role?.permissions
    if (!Array.isArray(perms)) return false
    return perms.some(p => permMatches(p, table, action))
  }

  return { isAdmin, can }
}
