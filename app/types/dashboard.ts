// Shared type definitions for the metadata-driven generic CRUD system
// used by both the server meta API and the frontend dashboard.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richEditor'
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

/**
 * Field-level rule. Either a list of role names allowed for the mode, or an
 * explicit rule with permissions and masking. Sensitive columns (password /
 * token / secret) are never readable through generic CRUD even if configured.
 */
export type FieldPolicyRule =
  | string[]
  | {
    readable?: boolean
    writable?: boolean
    readPermission?: string
    writePermission?: string
    mask?: boolean
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
   * Row-level data scoping. `scope` wins over the legacy role-level
   * `dataScope` value (`all` / `self`). `global` still requires an explicit
   * `*` / `global` permission; missing columns or context deny access.
   */
  dataScope?: {
    scope?: 'own' | 'assigned' | 'department' | 'organization' | 'tenant' | 'global'
    /** Name of a module-registered DataScope resolver (overrides `scope`). */
    resolver?: string
    /** Legacy: row owner column for `own` scope. */
    ownerColumn?: string
    /** Legacy: applies `own` scope to the users table itself (id = current user). */
    userTable?: boolean
    assigneeColumn?: string
    departmentColumn?: string
    organizationColumn?: string
    tenantColumn?: string
  }
  /**
   * Version history — when set, the generic `update` endpoint automatically
   * snapshots the previous value of the listed fields (into the row's `versions`
   * jsonb column) before each update that touches them. Newest first, capped at
   * `max` (default 50). E.g. `{ fields: ['title','content'], max: 50 }`.
   */
  versions?: { fields: string[]; max?: number }
  /**
   * Field-level read/write policy keyed by field key. Each list contains the
   * role names allowed to read/write that field (`'*'` allows everyone);
   * admins always bypass. Fields without an entry keep table-level behavior.
   * Enforced server-side on list/detail/export and create/update payloads.
   */
  fieldPolicy?: Record<string, FieldPolicyRule>
}

export interface TableMeta {
  /** Unique logical identifier — used in URL ?table=... and route names */
  table: string
  /**
   * Generic CRUD exposure. Only `generic-crud` / `custom` tables can be
   * reached through `/api/dashboard/data/[table]`. Missing or `internal`
   * means the table exists for relations/pivots but is not an API resource.
   */
  exposure?: 'generic-crud' | 'custom' | 'internal'
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
  /** Direct URL path — overrides the default /dashboard/<table> route */
  url?: string
  /** Parent item key for hierarchical menu (null = root level) */
  parentId?: string | null
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
