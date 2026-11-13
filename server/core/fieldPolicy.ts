import type { FieldPolicyRule } from '~/types/dashboard'

export type { FieldPolicyRule }

export type FieldPolicy = Record<string, FieldPolicyRule>
export type FieldAccessMode = 'read' | 'write'
export interface FieldActor {
  roleName?: string | null
  permissions?: readonly string[] | null
}

/** Columns that must never be readable through generic CRUD. */
const SENSITIVE_FIELD = /password|token|secret|credential|api.?key/i

function hasPermission(actor: FieldActor, permission: string | undefined): boolean {
  if (!permission) return true
  const permissions = actor.permissions
  if (!permissions) return false
  return permissions.includes('*') || permissions.includes(permission)
}

function isObjectRule(rule: FieldPolicyRule): rule is Exclude<FieldPolicyRule, readonly string[]> {
  return !Array.isArray(rule)
}

export function canAccessField(
  actor: FieldActor,
  policy: FieldPolicy | undefined,
  field: string,
  mode: FieldAccessMode
): boolean {
  // Sensitive columns are denied before any role/admin bypass: they may only
  // be written when the resource explicitly opts in.
  if (SENSITIVE_FIELD.test(field)) {
    const rule = policy?.[field]
    return mode === 'write' && !!rule && isObjectRule(rule) && rule.writable === true
  }
  if (actor.roleName === 'admin') return true

  const rule = policy?.[field]
  if (!rule) return true

  if (Array.isArray(rule)) {
    if (rule.length === 0 || rule.includes('*')) return true
    return !!actor.roleName && rule.includes(actor.roleName)
  }
  if (mode === 'read') {
    if (rule.readable === false) return false
    return hasPermission(actor, rule.readPermission)
  }
  if (rule.writable === false) return false
  return hasPermission(actor, rule.writePermission)
}

/** Field keys the actor must not receive in responses. */
export function hiddenFieldsFor(actor: FieldActor, policy: FieldPolicy | undefined): Set<string> {
  const hidden = new Set<string>()
  for (const field of Object.keys(policy ?? {})) {
    if (!canAccessField(actor, policy, field, 'read')) hidden.add(field)
  }
  // Sensitive fields are hidden even without an explicit rule.
  return hidden
}

/** Readable field keys that must be masked (never returned in clear text). */
export function maskedFieldsFor(actor: FieldActor, policy: FieldPolicy | undefined): Set<string> {
  const masked = new Set<string>()
  for (const [field, rule] of Object.entries(policy ?? {})) {
    if (isObjectRule(rule) && rule.mask && canAccessField(actor, policy, field, 'read')) masked.add(field)
  }
  return masked
}

export function withoutHiddenFields<T extends Record<string, unknown>>(row: T, hidden: ReadonlySet<string>): T {
  if (hidden.size === 0) return row
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(row)) {
    if (!hidden.has(field)) out[field] = value
  }
  return out as T
}

/** Apply read policy (hiding + masking) to a row without mutating the source. */
export function applyReadPolicy<T extends Record<string, unknown>>(
  actor: FieldActor,
  policy: FieldPolicy | undefined,
  row: T
): T {
  const hidden = hiddenFieldsFor(actor, policy)
  const masked = maskedFieldsFor(actor, policy)
  if (hidden.size === 0 && masked.size === 0) return row
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(row)) {
    // Credential-like columns never leave the server through generic CRUD.
    if (hidden.has(field) || SENSITIVE_FIELD.test(field)) continue
    out[field] = masked.has(field) ? '***' : value
  }
  return out as T
}

/** Payload fields the actor is not allowed to write. */
export function deniedWriteFields(
  actor: FieldActor,
  policy: FieldPolicy | undefined,
  payload: Record<string, unknown>
): string[] {
  return Object.keys(payload).filter(field => !canAccessField(actor, policy, field, 'write'))
}

/** Task-book alias: return a copy containing only readable fields. */
export function filterReadableFields<T extends Record<string, unknown>>(
  actor: FieldActor,
  policy: FieldPolicy | undefined,
  row: T
): T {
  return applyReadPolicy(actor, policy, row)
}

/** Task-book alias: strip fields the actor may not write from a payload. */
export function filterWritableFields(
  actor: FieldActor,
  policy: FieldPolicy | undefined,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const denied = new Set(deniedWriteFields(actor, policy, payload))
  if (denied.size === 0) return payload
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(payload)) {
    if (!denied.has(field)) out[field] = value
  }
  return out
}
