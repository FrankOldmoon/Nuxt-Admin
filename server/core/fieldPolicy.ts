/**
 * Field-level access rules. Pure helpers so the generic CRUD service and unit
 * tests share one implementation; admin always bypasses, missing rules allow.
 */

export interface FieldPolicyRule {
  read?: readonly string[]
  write?: readonly string[]
}

export type FieldPolicy = Record<string, FieldPolicyRule>
export type FieldAccessMode = 'read' | 'write'

export function canAccessField(
  roleName: string | null | undefined,
  policy: FieldPolicy | undefined,
  field: string,
  mode: FieldAccessMode
): boolean {
  if (roleName === 'admin') return true
  const allowed = policy?.[field]?.[mode]
  if (!allowed || allowed.length === 0) return true
  if (allowed.includes('*')) return true
  return !!roleName && allowed.includes(roleName)
}

/** Field keys the role must not receive in responses. */
export function hiddenFieldsFor(roleName: string | null | undefined, policy: FieldPolicy | undefined): Set<string> {
  const hidden = new Set<string>()
  for (const field of Object.keys(policy ?? {})) {
    if (!canAccessField(roleName, policy, field, 'read')) hidden.add(field)
  }
  return hidden
}

/** Strip non-readable fields from a row (returns a copy). */
export function withoutHiddenFields<T extends Record<string, unknown>>(row: T, hidden: ReadonlySet<string>): T {
  if (hidden.size === 0) return row
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(row)) {
    if (!hidden.has(field)) out[field] = value
  }
  return out as T
}

/** Payload fields the role is not allowed to write. */
export function deniedWriteFields(
  roleName: string | null | undefined,
  policy: FieldPolicy | undefined,
  payload: Record<string, unknown>
): string[] {
  return Object.keys(payload).filter(field => !canAccessField(roleName, policy, field, 'write'))
}
