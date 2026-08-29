/**
 * Operator catalog for the metadata-driven dynamic filter builder.
 *
 * Maps FieldMeta.type → an ordered list of allowed operators, each carrying
 * a human label, a hint whether a value input is required, and the
 * rendering "kind" (text / number / boolean / select / date / datetime /
 * between-pair) for the value input cell.
 *
 * Lives in a composable so both the `DashboardCrudFilters` builder UI and
 * any custom pages that want to pre-populate filters can share the same
 * definition source without manual duplication.
 */
import type { FieldType, FilterOperator, FilterOperatorMeta } from '~/types/dashboard'

const LABEL: Record<FilterOperator, string> = {
  eq: 'Equals',
  neq: 'Does not equal',
  contains: 'Contains',
  notContains: 'Does not contain',
  startsWith: 'Starts with',
  endsWith: 'Ends with',
  gt: 'Greater than',
  gte: 'Greater than or equal',
  lt: 'Less than',
  lte: 'Less than or equal',
  between: 'Between',
  isEmpty: 'Is empty',
  isNotEmpty: 'Is not empty',
  isNull: 'Is null',
  isNotNull: 'Is not null'
}

/** Text-like columns: text, textarea, password, hyperlink, image. */
const TEXT_OPS: FilterOperatorMeta[] = [
  { op: 'contains',    label: LABEL.contains,    needsValue: true, valueKind: 'text' },
  { op: 'notContains', label: LABEL.notContains, needsValue: true, valueKind: 'text' },
  { op: 'eq',          label: LABEL.eq,          needsValue: true, valueKind: 'text' },
  { op: 'neq',         label: LABEL.neq,         needsValue: true, valueKind: 'text' },
  { op: 'startsWith',  label: LABEL.startsWith,  needsValue: true, valueKind: 'text' },
  { op: 'endsWith',    label: LABEL.endsWith,    needsValue: true, valueKind: 'text' },
  { op: 'isEmpty',     label: LABEL.isEmpty,     needsValue: false },
  { op: 'isNotEmpty',  label: LABEL.isNotEmpty,  needsValue: false },
  { op: 'isNull',      label: LABEL.isNull,      needsValue: false },
  { op: 'isNotNull',   label: LABEL.isNotNull,   needsValue: false }
]

/** Numeric: number / relation (id) / select (id) */
const NUMBER_OPS: FilterOperatorMeta[] = [
  { op: 'eq',          label: LABEL.eq,          needsValue: true, valueKind: 'number' },
  { op: 'neq',         label: LABEL.neq,         needsValue: true, valueKind: 'number' },
  { op: 'gt',          label: LABEL.gt,          needsValue: true, valueKind: 'number' },
  { op: 'gte',         label: LABEL.gte,         needsValue: true, valueKind: 'number' },
  { op: 'lt',          label: LABEL.lt,          needsValue: true, valueKind: 'number' },
  { op: 'lte',         label: LABEL.lte,         needsValue: true, valueKind: 'number' },
  { op: 'between',     label: LABEL.between,     needsValue: true, valueKind: 'between' },
  { op: 'isNull',      label: LABEL.isNull,      needsValue: false },
  { op: 'isNotNull',   label: LABEL.isNotNull,   needsValue: false }
]

/** Boolean */
const BOOLEAN_OPS: FilterOperatorMeta[] = [
  { op: 'eq',  label: LABEL.eq,  needsValue: true, valueKind: 'boolean' },
  { op: 'neq', label: LABEL.neq, needsValue: true, valueKind: 'boolean' }
]

/** Date (calendar-day) vs datetime (timestamp with TZ): same operators,
 *  distinct input widget. */
const DATE_OPS: FilterOperatorMeta[] = [
  { op: 'eq',          label: LABEL.eq,          needsValue: true, valueKind: 'date' },
  { op: 'neq',         label: LABEL.neq,         needsValue: true, valueKind: 'date' },
  { op: 'gt',          label: LABEL.gt,          needsValue: true, valueKind: 'date' },
  { op: 'gte',         label: LABEL.gte,         needsValue: true, valueKind: 'date' },
  { op: 'lt',          label: LABEL.lt,          needsValue: true, valueKind: 'date' },
  { op: 'lte',         label: LABEL.lte,         needsValue: true, valueKind: 'date' },
  { op: 'between',     label: LABEL.between,     needsValue: true, valueKind: 'between' },
  { op: 'isNull',      label: LABEL.isNull,      needsValue: false },
  { op: 'isNotNull',   label: LABEL.isNotNull,   needsValue: false }
]

const DATETIME_OPS: FilterOperatorMeta[] = DATE_OPS.map(m =>
  m.valueKind === 'between' ? { ...m, valueKind: 'between' as const }
    : m.needsValue && m.valueKind === 'date' ? { ...m, valueKind: 'datetime' as const } : m
)

/** JSONB tags array: contains / isEmpty. */
const TAGS_OPS: FilterOperatorMeta[] = [
  { op: 'contains',    label: 'Contains tag',  needsValue: true, valueKind: 'text' },
  { op: 'notContains', label: 'Does not contain tag',  needsValue: true, valueKind: 'text' },
  { op: 'isEmpty',     label: LABEL.isEmpty,    needsValue: false },
  { op: 'isNotEmpty',  label: LABEL.isNotEmpty, needsValue: false }
]

/** JSON general: currently only text-ish contains and null/empty. */
const JSON_OPS: FilterOperatorMeta[] = [
  { op: 'contains',    label: LABEL.contains,    needsValue: true, valueKind: 'text' },
  { op: 'notContains', label: LABEL.notContains, needsValue: true, valueKind: 'text' },
  { op: 'isEmpty',     label: LABEL.isEmpty,     needsValue: false },
  { op: 'isNotEmpty',  label: LABEL.isNotEmpty,  needsValue: false },
  { op: 'isNull',      label: LABEL.isNull,      needsValue: false },
  { op: 'isNotNull',   label: LABEL.isNotNull,   needsValue: false }
]

/** Select: same shape as number (value is key) but UI may want to fall
 *  back to a dropdown input rather than a raw text input if relation
 *  options exist. */
const SELECT_OPS: FilterOperatorMeta[] = [
  { op: 'eq',          label: LABEL.eq,          needsValue: true, valueKind: 'select' },
  { op: 'neq',         label: LABEL.neq,         needsValue: true, valueKind: 'select' },
  { op: 'isNull',      label: LABEL.isNull,      needsValue: false },
  { op: 'isNotNull',   label: LABEL.isNotNull,   needsValue: false }
]

/** Password: only use text ops — don't show isEmpty/isNull which leak column state. */
const PASSWORD_OPS: FilterOperatorMeta[] = [
  { op: 'contains',    label: LABEL.contains,    needsValue: true, valueKind: 'text' },
  { op: 'eq',          label: LABEL.eq,          needsValue: true, valueKind: 'text' },
  { op: 'neq',         label: LABEL.neq,         needsValue: true, valueKind: 'text' }
]

/** many-to-many fields are pivot columns: filtering them requires a
 *  separate SQL EXISTS subquery that buildConditionExpr doesn't yet
 *  implement.  Expose NO operators for these so the UI simply hides
 *  them from the filterable columns list. */
const MANY_TO_MANY_OPS: FilterOperatorMeta[] = []

const FIELD_TYPE_OPERATORS: Record<FieldType, FilterOperatorMeta[]> = {
  text: TEXT_OPS,
  textarea: TEXT_OPS,
  password: PASSWORD_OPS,
  hyperlink: TEXT_OPS,
  image: TEXT_OPS,
  file: TEXT_OPS,
  files: TEXT_OPS,
  number: NUMBER_OPS,
  /** Foreign-key columns: use SELECT_OPS so the value input renders as a
   *  dropdown populated from relationOptions rather than a raw number box. */
  relation: SELECT_OPS,
  boolean: BOOLEAN_OPS,
  date: DATE_OPS,
  datetime: DATETIME_OPS,
  time: DATE_OPS,
  select: SELECT_OPS,
  tags: TAGS_OPS,
  json: JSON_OPS,
  markdown: TEXT_OPS,
  icon: TEXT_OPS,
  'many-to-many': MANY_TO_MANY_OPS
}

export function useFilterOperators() {
  function getOperatorsForType(type: FieldType): FilterOperatorMeta[] {
    return FIELD_TYPE_OPERATORS[type] ?? TEXT_OPS
  }
  /** Returns true if a field contributes at least one filter operator. */
  function isFilterable(type: FieldType): boolean {
    return getOperatorsForType(type).length > 0
  }
  return {
    FIELD_TYPE_OPERATORS,
    getOperatorsForType,
    isFilterable
  }
}
