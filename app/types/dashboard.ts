// Shared type definitions for the metadata-driven generic CRUD system
// used by both the server meta API and the frontend dashboard.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'image'
  | 'file'
  | 'files'
  | 'hyperlink'
  | 'tags'
  | 'password'
  | 'relation'
  | 'json'
  | 'many-to-many'
  | 'icon'

export interface FieldOption {
  label: string
  value: string | number | null
}

export interface FieldRelation {
  /** Name of the related table registered in tables.ts */
  table: string
  /** Column to use as the display label (e.g. "name") */
  labelKey: string
  /** Column to use as the option value (e.g. "id") */
  valueKey: string
  /**
   * When true, the form field renders a searchable combobox that allows
   * typing a new value to create a record in the related table on the fly.
   * The new record is created via POST /api/dashboard/data/{table} with
   * the `labelKey` as the field name.
   */
  creatable?: boolean
  /**
   * When `creatable` is true and the target table has a required slug/URL
   * column, set this to the column name (e.g. `"url"`). The component will
   * auto-generate a slug from the label value when creating a new record.
   */
  slugField?: string
}

export interface FieldValidation {
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  step?: number | 'any'
  pattern?: string
}

export interface FieldMeta {
  /** Database column key — must exactly match the drizzle schema column */
  key: string
  /** Human readable label (Chinese) */
  label: string
  /** How this field should be rendered in forms/cells/detail */
  type: FieldType
  /** Whether the database column accepts NULL */
  nullable: boolean
  /** Appears in create/edit forms */
  showInForm: boolean
  /** Rendered as a table column */
  showInTable: boolean
  /** Rendered in the detail modal */
  showInDetail: boolean
  /** Editable in update form (id/createdAt etc. are typically false) */
  editable: boolean
  /** Cross-table relation metadata for `relation` type */
  relation?: FieldRelation
  /** Static option list for `select`/`tags` types */
  options?: FieldOption[]
  /** Client-side validation hints */
  validation?: FieldValidation
  /** Placeholder for inputs and form-field help text */
  placeholder?: string
  helpText?: string
  /** Column width hint in table (px, Tailwind class, or fraction) */
  widthClass?: string
  /**
   * Optional key of a registered field transformer (see `registerFieldTransform`
   * in `app/composables/useFieldTransform.ts`) whose `getter` re-shapes the raw
   * stored value for display (cells + detail) and whose `setter` re-shapes the
   * form value back into the API/storage format before create/update.
   *
   * Only the transformer KEY is stored here (string) — functions cannot be
   * serialised through the `/api/dashboard/meta` JSON endpoint, so the actual
   * functions live in a client-side registry keyed by this string.
   *
   * Example:
   *   { key: 'price', ..., getter: 'currency', setter: 'currency' }
   */
  getter?: string
  setter?: string
}

export interface TableFeatures {
  /** Soft-delete support via `deletedAt` column */
  softDelete: boolean
  /** List of text column keys to use for the `?search=` filter */
  search: string[]
  defaultSort?: { field: string; order: 'asc' | 'desc' }
  /** Whether the row "detail" action is available (defaults to true) */
  detail?: boolean
  /**
   * Row-level data scoping (applies to non-admin roles):
   * - `ownerColumn`: the field holding the row's owner user (e.g. files.userId / notifications.createdBy),
   *   dataScope=self → only ownerColumn=me.
   * - `userTable`: applies to the user table itself (self → only me).
   */
  dataScope?: { ownerColumn?: string; userTable?: boolean }
}

export interface TableMeta {
  /** Unique logical identifier — used in URL ?table=... and route names */
  table: string
  /** Human readable section name (Chinese) */
  label: string
  /** Iconify icon class */
  icon: string
  /** Field definitions ordered by default column/display order */
  fields: FieldMeta[]
  features: TableFeatures
  /**
   * Custom tables bypass the generic CRUD API and render a dedicated
   * component in the dashboard page.  The server rejects generic requests
   * with 405 and the frontend dispatches to `customApi` if set.
   */
  custom: boolean
  /** Optional URL prefix for the custom API (e.g. "/api/users") */
  customApi?: string
}

export interface DashboardMenuItem {
  table: string
  label: string
  icon: string
  /** Sort order (lower comes first) */
  order?: number
  /** Hidden from the sidebar (still accessible via URL) */
  hidden?: boolean
  /**
   * True when this is a system default (not admin-customized) menu entry —
   * the label is resolved through i18n (`dashboard.tables.<table>`).
   */
  translatable?: boolean
}

export interface DashboardMeta {
  menu: DashboardMenuItem[]
  /** Minimal field metadata for sidebar/overview pages */
  tables: Array<Pick<TableMeta, 'table' | 'label' | 'icon' | 'custom'>>
}

export interface TableMetaWithOptions extends TableMeta {
  /** Resolved option list for every `relation` / `select` field */
  relationOptions: Record<string, FieldOption[]>
}

export interface BatchAction {
  action: 'soft-delete' | 'restore' | 'permanent-delete'
  ids: Array<number | string>
}

/** Allowed filter operators.  Each FieldType exposes a subset of these. */
export type FilterOperator =
  | 'eq' | 'neq'
  | 'contains' | 'notContains'
  | 'startsWith' | 'endsWith'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between'
  | 'isEmpty' | 'isNotEmpty'
  | 'isNull' | 'isNotNull'

/** A single advanced filter condition row.
 *  - `logic` is ignored on the first row (it is always AND-ed with search/trashed/other system conditions)
 *  - `value` is not needed for operators `isEmpty` / `isNotEmpty` / `isNull` / `isNotNull`
 *  - For `between`, value is expected to be a `[min, max]` array (or a JSON string thereof)
 */
export interface AdvancedFilterCondition {
  /** Logical connection to the *previous* condition (ignored for row 0) */
  logic: 'AND' | 'OR'
  /** FieldMeta.key */
  field: string
  /** Chosen operator */
  op: FilterOperator
  /** Raw input value (string for text/number, array for between, undefined for isNull-style ops) */
  value?: string | number | boolean | (string | number)[] | null
}

/** Operator metadata for rendering the UI dropdown per FieldType. */
export interface FilterOperatorMeta {
  op: FilterOperator
  /** Human readable label (i18n key or raw text) */
  label: string
  /** Whether this operator requires a value input (false for isEmpty/isNull etc.) */
  needsValue: boolean
  /** Value input kind when `needsValue` is true.
   *  'text'/'number'/'boolean'/'select'/'date'/'datetime' select the renderer.
   *  'between' uses a pair of same-kind inputs (min/max). */
  valueKind?: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'datetime' | 'between'
}
