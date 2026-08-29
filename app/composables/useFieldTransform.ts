/**
 * Global registry for per-field custom getter/setter transformers.
 *
 * FieldMeta can declare `getter` / `setter` — a string KEY that references a
 * transformer registered here.  The registry is a plain client-side Map so the
 * functions never need to cross the JSON `/api/dashboard/meta` boundary — only
 * the string key is serialised, and the live functions are resolved at render /
 * submit time.
 *
 * Example (register once, e.g. in a plugin exported from `app/plugins/`):
 * ```ts
 * import { registerFieldTransform } from '~/composables/useFieldTransform'
 *
 * registerFieldTransform('duration', {
 *   getter: (v) => (typeof v === 'number' ? `${v}min` : v),
 *   setter: (v) => (typeof v === 'string' ? parseFloat(v) : v),
 * })
 *
 * registerFieldTransform('money', {
 *   getter: (v) => (typeof v === 'number' ? `¥${v.toFixed(2)}` : v),
 *   setter: (v) => (typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : v),
 * })
 * ```
 */

export type FieldTransformGetter = (value: unknown) => unknown
export type FieldTransformSetter = (value: unknown) => unknown

export interface FieldTransform {
  /** Transform a stored value into its display form (cell + detail). */
  getter?: FieldTransformGetter
  /** Transform a form value back into its storage form before create/update. */
  setter?: FieldTransformSetter
}

const registry = new Map<string, FieldTransform>()

/** Register (or overwrite) a getter/setter referenced by meta's `getter`/`setter`. */
export function registerFieldTransform(key: string, transform: FieldTransform): void {
  registry.set(key, transform)
}

/** Look up a transformer by key. */
export function getFieldTransform(key: string | undefined): FieldTransform | undefined {
  if (!key) return undefined
  return registry.get(key)
}

/**
 * Apply a field's getter (if any) to a stored value for display.
 * Returns the raw value unchanged when no getter is registered.
 */
export function applyFieldGetter(key: string | undefined, value: unknown): unknown {
  const transform = getFieldTransform(key)
  if (!transform?.getter) return value
  try {
    return transform.getter(value)
  } catch {
    return value
  }
}

/**
 * Apply a field's setter (if any) to a form value before persisting.
 * Returns the raw value unchanged when no setter is registered.
 */
export function applyFieldSetter(key: string | undefined, value: unknown): unknown {
  const transform = getFieldTransform(key)
  if (!transform?.setter) return value
  try {
    return transform.setter(value)
  } catch {
    return value
  }
}

/** Convenience composable for components that need the apply helpers. */
export function useFieldTransform() {
  return { applyFieldGetter, applyFieldSetter }
}