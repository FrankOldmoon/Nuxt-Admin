/**
 * Client-side form validation for the generic CRUD, mirroring the backend's
 * `throwOnInvalid` in server/utils/dashboard/crudService.ts.
 *
 * Walks each field's `meta.validation` (required / minLength / maxLength /
 * min / max / pattern) and returns a `{ fieldKey: message }` map. Empty values
 * are allowed for non-required fields; on update, omitted keys are skipped
 * (they mean "leave unchanged").
 */
import type { FieldMeta, TableMetaWithOptions } from '~/types/dashboard'

export function validateForm(
  meta: TableMetaWithOptions,
  form: Record<string, unknown>,
  mode: 'create' | 'update' = 'create'
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of meta.fields) {
    const rule = f.validation
    if (!rule) continue
    const key = f.key
    const raw = form[key]
    const v = (raw ?? '') as unknown
    const isEmpty = v === undefined || v === null || v === ''
    if (mode === 'update' && !(key in form)) continue

    if (rule.required && isEmpty) {
      errors[key] = validationMsg(f, 'required')
      continue
    }
    if (isEmpty) continue

    if (typeof v === 'string') {
      if (rule.minLength != null && v.length < rule.minLength) {
        errors[key] = validationMsg(f, 'minLength', rule.minLength)
        continue
      }
      if (rule.maxLength != null && v.length > rule.maxLength) {
        errors[key] = validationMsg(f, 'maxLength', rule.maxLength)
        continue
      }
      if (rule.pattern && !new RegExp(rule.pattern).test(v)) {
        errors[key] = validationMsg(f, 'pattern')
        continue
      }
    }

    if (f.type === 'number' && typeof v !== 'boolean') {
      const n = Number(v)
      if (!Number.isNaN(n)) {
        if (rule.min != null && n < rule.min) errors[key] = validationMsg(f, 'min', Number(rule.min))
        else if (rule.max != null && n > rule.max) errors[key] = validationMsg(f, 'max', Number(rule.max))
      }
    }
  }
  return errors
}

type RuleKey = 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern'

function validationMsg(f: FieldMeta, rule: RuleKey, num?: number): string {
  switch (rule) {
    case 'required': return `Required`
    case 'minLength': return `Min ${num} characters`
    case 'maxLength': return `Max ${num} characters`
    case 'min': return `Must be >= ${num}`
    case 'max': return `Must be <= ${num}`
    case 'pattern': return `Invalid format`
    default: return `Invalid`
  }
}