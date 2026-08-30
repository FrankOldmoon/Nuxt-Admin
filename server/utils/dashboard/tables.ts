// Registry of tables that can be managed via the generic dashboard CRUD.
//
// Tables with `custom: false` are backed by /api/dashboard/data/[table]/*
// and rendered via DashboardCrudPage.  Some tables (users, files) have
// **dedicated page files** at pages/dashboard/<table>.vue that take routing
// priority over [table].vue, plus **custom API files** at
// server/api/dashboard/data/<table>/*.ts that take routing priority over
// the generic [table]/*.ts handlers.  This lets them reuse DashboardCrudPage
// (with slots for customisation) while keeping custom business logic.
//
// Tables with `custom: true` (e.g. configs) fully bypass the generic CRUD
// API and are rendered by a dedicated component referenced in CUSTOM_PAGE_MAP.
//
// NOTE: Fields are intentionally listed in the column/display order we want
// in the UI.  Server-side filters/relations look up fields by `key`.
//
// ============ Schema auto-discovery ============
// Starting with v2, you do NOT need to manually register a table in TABLES
// or call registerDashboardTable() to make it editable via the generic
// dashboard.  Just define a new table in the drizzle schema export and call
// registerDrizzleSchema() from a Nitro plugin — the generic
// `getRegisteredTable(name)` and meta API will automatically build a
// TableMeta on-the-fly from the PgTable column metadata the first time
// someone visits `/dashboard/<table>`.
//
// Tables that need custom field order, custom labels, relation hints,
// password fields, i18n-friendly option lists etc. should still be
// registered manually — the manual entry always wins over auto-discovery.

import type { FieldMeta, TableMeta, FieldType } from '~/types/dashboard'
import { getTableColumns } from 'drizzle-orm'
import type { PgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core'

// -------------- per-table field lists --------------

const rolesFields: FieldMeta[] = [
  {
    key: 'id', label: 'ID', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-16'
  },
  {
    key: 'name', label: 'Role Name', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, minLength: 2, maxLength: 50 },
    placeholder: 'e.g. admin / user'
  },
  {
    key: 'description', label: 'Description', type: 'text', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { maxLength: 255 }
  },
  {
    key: 'permissions', label: 'Authorized Dashboard Tables (JSON Array)', type: 'json', nullable: false,
    showInForm: true, showInTable: false, showInDetail: true, editable: true,
    helpText: 'e.g. ["templates","notification"]; ["*"] means all (admin default). Supports table:action granularity (e.g. "files:read","files:create"). Sensitive tables (users/roles/configs) are visible only to admins.'
  },
  {
    key: 'dataScope', label: 'Data Scope', type: 'select', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    options: [
      { label: 'All Data', value: 'all' },
      { label: 'Self Only', value: 'self' }
    ],
    helpText: 'Applies to non-admin roles: all=everything; self=only my own data'
  },
  {
    key: 'createdAt', label: 'Created At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-48'
  },
  {
    key: 'updatedAt', label: 'Updated At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  },
  {
    key: 'deletedAt', label: 'Deleted At', type: 'datetime', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  }
]

// Users: custom API at /api/dashboard/data/users/* + dedicated page.
// The `role` field is virtual (not a DB column) — it's returned by the
// custom API as a nested object { id, name, description } and displayed
// via a slot.  `roleId` is the real FK used in the form (relation select).
const usersFields: FieldMeta[] = [
  {
    key: 'id', label: 'ID', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-16'
  },
  {
    key: 'username', label: 'Username', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_]{3,50}$' },
    placeholder: '3-50 letters, digits, underscores'
  },
  {
    key: 'name', label: 'Name', type: 'text', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { maxLength: 100 }
  },
  {
    key: 'telephone', label: 'Telephone', type: 'text', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { maxLength: 30 }
  },
  {
    key: 'email', label: 'Email', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, maxLength: 255 }
  },
  {
    key: 'password', label: 'Password', type: 'password', nullable: true,
    showInForm: true, showInTable: false, showInDetail: false, editable: true,
    validation: { required: true, minLength: 8 },
    helpText: 'Leave empty to keep the password unchanged'
  },
  {
    key: 'roleId', label: 'Role', type: 'relation', nullable: false,
    showInForm: true, showInTable: false, showInDetail: true, editable: true,
    relation: { table: 'roles', labelKey: 'name', valueKey: 'id' }
  },
  {
    // Virtual field: returned by the custom API as { id, name, description }.
    // Displayed via #table-role / #detail-role slots.  Not a DB column.
    key: 'role', label: 'Role', type: 'text', nullable: true,
    showInForm: false, showInTable: true, showInDetail: true, editable: false
  },
  {
    key: 'isActive', label: 'Status', type: 'boolean', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true
  },
  {
    key: 'lastLoginAt', label: 'Last Login At', type: 'datetime', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false,
    widthClass: 'w-44'
  },
  {
    key: 'lastLoginIp', label: 'Last Login IP', type: 'text', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false,
    widthClass: 'w-40'
  },
  {
    key: 'createdAt', label: 'Created At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-40'
  },
  {
    key: 'deletedAt', label: 'Deleted At', type: 'datetime', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  }
]

// Files: custom API at /api/dashboard/data/files/* + dedicated page.
// The create flow uses file upload (not a form), so only `filename` is
// editable in the form (for rename).  All other fields are read-only.
const filesFields: FieldMeta[] = [
  {
    key: 'id', label: 'ID', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-16'
  },
  {
    key: 'filename', label: 'File Name', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, maxLength: 255 }
  },
  {
    key: 'originalName', label: 'Original Name', type: 'text', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false
  },
  {
    key: 'hash', label: 'Hash', type: 'text', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-28'
  },
  {
    key: 'size', label: 'Size', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-24'
  },
  {
    key: 'mimeType', label: 'Type', type: 'text', nullable: true,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-32'
  },
  {
    key: 'path', label: 'Path', type: 'text', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-40'
  },
  {
    key: 'storage', label: 'Storage', type: 'text', nullable: false,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  },
  {
    key: 'userId', label: 'Owner', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-20'
  },
  {
    key: 'createdAt', label: 'Created At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-40'
  },
  {
    key: 'deletedAt', label: 'Deleted At', type: 'datetime', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  }
]

/**
 * Notification management (dedicated to dashboard/notification generic CRUD).
 *
 * NOTE: this is the admin-facing "database-table-level CRUD".  The homepage
 * /notifications is the user inbox (WebSocket real-time push, mark-as-read,
 * send filtered by user, etc.) — the two are completely different.
 * Therefore complex fields like createdBy / targetUserIds are simplified in
 * the generic CRUD: you cannot select target users in the generic create form;
 * to send notifications per-user use the homepage /notifications instead.
 */
const notificationFields: FieldMeta[] = [
  {
    key: 'id', label: 'ID', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-16'
  },
  {
    key: 'title', label: 'Title', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, minLength: 2, maxLength: 255 },
    placeholder: 'e.g. System maintenance announcement'
  },
  {
    key: 'content', label: 'Content', type: 'textarea', nullable: false,
    showInForm: true, showInTable: false, showInDetail: true, editable: true,
    validation: { required: true, minLength: 1 }
  },
  {
    key: 'createdBy', label: 'Created By ID', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-24',
    // If you want to render this as a user dropdown, uncomment the relation below
    // relation: { table: 'users', labelKey: 'username', valueKey: 'id' }
  },
  {
    key: 'targetUserIds', label: 'Target User ID Array', type: 'json', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false,
    helpText: 'NULL = broadcast to everyone; non-empty array = send only to those user IDs. Not editable in the generic CRUD; use the homepage Notifications feature for targeted sends.'
  },
  {
    key: 'createdAt', label: 'Created At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-48'
  },
  {
    key: 'updatedAt', label: 'Updated At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  },
  {
    key: 'deletedAt', label: 'Deleted At', type: 'datetime', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  }
]

// ------------- main registry ----------------

// Showcase table — `templates`.  Exercises the "personalization ladder":
//   L0  generic CRUD (no page file) — reachable via /dashboard/templates
//   L1  custom list API override (adds a virtual column to list rows)
//   L2  per-cell / per-detail / per-form slot overrides
//   L3  custom toolbar + custom filters
//   L4  fully custom page (fullCustomPage switch)
// The list enrichment & page live at:
//   server/api/dashboard/data/[table]/index.get.ts (L1 inline override)
//   app/pages/dashboard/templates.vue               (L2/L3/L4 override)
// Switches are persisted in the `configs` table under key
//   `demo_templates_switches` (see server/utils/templatesDemo.ts) and toggled
//   from the pages/dashboard/templates.vue switch panel, so you can turn each
//   personalization point on/off to compare against plain generic CRUD.
//
// NOTE: `inventoryStatus` is a VIRTUAL column (not a DB column). The generic
// CRUD list endpoint leaves it empty (rendered "-"); the L1 custom list API
// populates it from a stock heuristic. This makes the L1 override observable.
const templatesFields: FieldMeta[] = [
  {
    key: 'id', label: 'ID', type: 'number', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-16'
  },
  {
    key: 'name', label: 'Name', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, minLength: 2, maxLength: 100 },
    placeholder: 'e.g. Invoice layout'
  },
  {
    key: 'sku', label: 'SKU', type: 'text', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { required: true, maxLength: 50 },
    placeholder: 'e.g. KB-810-BLK'
  },
  {
    key: 'price', label: 'Price', type: 'number', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { min: 0, step: 0.01 },
    helpText: 'Unit price in the default currency. Rendered with a slot override when L2 is on.',
    widthClass: 'w-32',
    // Demo custom getter/setter: cell & detail show "¥<price>"; saving the
    // form strips the currency symbol back to a number. See
    // app/composables/useFieldTransform.ts + app/app.vue.
    getter: 'currency',
    setter: 'currency'
  },
  {
    key: 'stock', label: 'Stock', type: 'number', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    validation: { min: 0 },
    widthClass: 'w-28'
  },
  {
    key: 'status', label: 'Status', type: 'select', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Draft', value: 'draft' },
      { label: 'Archived', value: 'archived' }
    ],
    widthClass: 'w-28'
  },
  {
    key: 'coverImage', label: 'Cover Image', type: 'image', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    helpText: 'Thumbnail shown in the list — upload an image, stored as a file path.',
    widthClass: 'w-24'
  },
  {
    key: 'docFile', label: 'Documents', type: 'files', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    helpText: 'Attach one or more spec/PDF/manual files (multi upload), stored as a path array.',
    widthClass: 'w-40'
  },
  {
    key: 'userId', label: 'Owner', type: 'relation', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    relation: { table: 'users', labelKey: 'name', valueKey: 'id' },
    helpText: 'The user who owns this template.',
    widthClass: 'w-24'
  },
  {
    key: 'tags', label: 'Tags', type: 'tags', nullable: false,
    showInForm: true, showInTable: true, showInDetail: true, editable: true,
    options: [
      { label: 'New', value: 'new' },
      { label: 'Hot', value: 'hot' },
      { label: 'Sale', value: 'sale' },
      { label: 'Featured', value: 'featured' },
      { label: 'Refurbished', value: 'refurbished' }
    ],
    widthClass: 'w-40'
  },
  {
    key: 'description', label: 'Description', type: 'textarea', nullable: true,
    showInForm: true, showInTable: false, showInDetail: true, editable: true
  },
  {
    key: 'meta', label: 'Meta (JSON)', type: 'json', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: true,
    helpText: 'Free-form JSON, e.g. {"color":"black","weight":"1.2kg"}'
  },
  {
    key: 'content', label: 'Content', type: 'richEditor', nullable: true,
    showInForm: true, showInTable: false, showInDetail: true, editable: true,
    helpText: 'Rich text body stored as Tiptap JSON.'
  },
  {
    key: 'releasedAt', label: 'Released At', type: 'datetime', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true
  },
  {
    key: 'launchDate', label: 'Launch Date', type: 'date', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true
  },
  {
    key: 'openingTime', label: 'Opening Time', type: 'time', nullable: true,
    showInForm: true, showInTable: true, showInDetail: true, editable: true
  },
  // --- Virtual columns, populated ONLY by the L1 custom list API ---
  {
    key: 'inventoryStatus', label: 'Inventory (L1)', type: 'select', nullable: true,
    showInForm: false, showInTable: true, showInDetail: false, editable: false,
    options: [
      { label: 'In Stock', value: 'in_stock' },
      { label: 'Low Stock', value: 'low_stock' },
      { label: 'Out of Stock', value: 'out_of_stock' }
    ],
    widthClass: 'w-32'
  },
  {
    key: 'createdAt', label: 'Created At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: true, showInDetail: true, editable: false,
    widthClass: 'w-40'
  },
  {
    key: 'updatedAt', label: 'Updated At', type: 'datetime', nullable: false,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  },
  {
    key: 'deletedAt', label: 'Deleted At', type: 'datetime', nullable: true,
    showInForm: false, showInTable: false, showInDetail: true, editable: false
  }
]

export interface RegisteredTable {
  meta: TableMeta
  /** Drizzle schema table handle — resolved from `schema[table]` at runtime */
  getTable(schema: Record<string, unknown>): unknown
}

const TABLES: RegisteredTable[] = [
  {
    meta: {
      table: 'roles',
      label: 'Roles',
      icon: 'i-lucide-shield',
      fields: rolesFields,
      features: {
        softDelete: true,
        search: ['name', 'description'],
        defaultSort: { field: 'id', order: 'asc' }
      },
      custom: false
    },
    getTable: (s) => s.roles
  },
  {
    meta: {
      table: 'users',
      label: 'Users',
      icon: 'i-lucide-users',
      fields: usersFields,
      features: {
        softDelete: true,
        search: ['username', 'email', 'name'],
        defaultSort: { field: 'id', order: 'asc' },
        // Row-level data scope: applies to the users table itself (self=only self)
        dataScope: { userTable: true }
      },
      custom: false
    },
    getTable: (s) => s.users
  },
  {
    meta: {
      table: 'configs',
      label: 'System Config',
      icon: 'i-lucide-settings-2',
      fields: [],
      features: {
        softDelete: false,
        search: ['key', 'value', 'description'],
        defaultSort: { field: 'id', order: 'asc' }
      },
      custom: true,
      customApi: '/api/config'
    },
    getTable: (s) => s.configs
  },
  {
    meta: {
      table: 'files',
      label: 'Files',
      icon: 'i-lucide-folder-open',
      fields: filesFields,
      features: {
        softDelete: true,
        search: ['filename', 'originalName', 'mimeType'],
        defaultSort: { field: 'createdAt', order: 'desc' },
        dataScope: { ownerColumn: 'userId' }
      },
      custom: false
    },
    getTable: (s) => s.files
  },
  {
    meta: {
      table: 'notifications',
      label: 'Notifications',
      icon: 'i-lucide-bell-ring',
      fields: notificationFields,
      features: {
        softDelete: true,
        search: ['title', 'content'],
        defaultSort: { field: 'createdAt', order: 'desc' },
        dataScope: { ownerColumn: 'createdBy' }
      },
      custom: false
    },
    getTable: (s) => s.notifications
  },
  {
    meta: {
      table: 'templates',
      label: 'Templates',
      icon: 'i-lucide-file-text',
      fields: templatesFields,
      features: {
        softDelete: true,
        search: ['name', 'sku', 'description'],
        defaultSort: { field: 'id', order: 'asc' }
      },
      custom: false
    },
    getTable: (s) => s.templates
  }
]

/** Length of the manually-populated TABLES[] array above — used later by
 *  `listAllAutoDiscoverableTables()` to distinguish entries that were
 *  explicitly curated by a developer (indices 0 … ORIGINAL_TABLES_LENGTH-1)
 *  from those injected at runtime (either auto-discovered, or via
 *  `registerDashboardTable()` called from Nitro plugins). */
const ORIGINAL_TABLES_LENGTH = TABLES.length

// NOTE: getRegisteredTables() / getRegisteredTable() / getTableMeta() are
// intentionally NOT declared here.  They live alongside the auto-discovery
// machinery further down in this file so getRegisteredTable() can fall back
// to autoDiscoverTable() when there's no manual TABLES[] entry.

/**
 * Module extension point — registers an additional dashboard table into
 * the main CRUD system at Nitro startup time.
 *
 * Modules can call this from their own `server/plugins/*`
 * handler, passing a `RegisteredTable` whose `getTable()` typically returns
 * a captured Drizzle table reference directly (ignoring the `schema` arg,
 * since the module doesn't live in the main project's `schema` export).
 *
 * After registration, `/api/dashboard/meta/:table` and all generic
 * `/api/dashboard/data/:table/*` generic routes begin serving the new
 * table using the main project's handlers — no per-module API files needed.
 *
 * IMPORTANT: if `menuOrder` is provided, the table is also added to the
 * default admin sidebar menu; omit it to keep the table accessible only
 * via direct URL (useful for internal tables that shouldn't pollute the
 * main admin menu).
 */
export function registerDashboardTable(
  reg: RegisteredTable,
  opts: { menuOrder?: number } = {}
): void {
  // Reject duplicates — plugin reloads during dev can re-invoke us
  if (TABLES.some(t => t.meta.table === reg.meta.table)) return
  // Attach any pivot-discovered many-to-many virtual fields (unless opt-in
  // custom table completely controls its own fields / API).
  if (!reg.meta.custom) {
    reg = { ...reg, meta: attachManyToManyVirtualFields(reg.meta) }
  }
  TABLES.push(reg)

  if (typeof opts.menuOrder === 'number') {
    const existing = DEFAULT_MENU.find(m => m.table === reg.meta.table)
    if (!existing) {
      DEFAULT_MENU.push({
        table: reg.meta.table,
        label: reg.meta.label,
        icon: reg.meta.icon || 'i-lucide-layout-grid',
        order: opts.menuOrder
      })
      // Keep menu sorted by `order`
      DEFAULT_MENU.sort((a, b) => a.order - b.order)
    }
  }
}

// Default menu order — a user-defined `dashboard.menu` config can override
// the label/icon/order/hidden state at runtime (see meta API).
export const DEFAULT_MENU: Array<{
  table: string; label: string; icon: string; order: number
}> = [
  { table: 'roles', label: 'Roles', icon: 'i-lucide-shield', order: 10 },
  { table: 'users', label: 'Users', icon: 'i-lucide-users', order: 20 },
  { table: 'files', label: 'Files', icon: 'i-lucide-folder-open', order: 30 },
  { table: 'notifications', label: 'Notifications', icon: 'i-lucide-bell-ring', order: 40 },
  { table: 'templates', label: 'Templates', icon: 'i-lucide-file-text', order: 50 },
  { table: 'configs', label: 'System Config', icon: 'i-lucide-settings-2', order: 60 }
]

// ========================================================================
// Schema registry + TableMeta auto-inference
// ========================================================================

/** All registered Drizzle schema exports.  Order matters — we scan them in
 *  registration order when auto-discovering a table by name. */
const SCHEMA_REGISTRY: Array<Record<string, unknown>> = []

/**
 * Register a Drizzle schema export into the auto-discovery pool.
 *
 * Usage (from a Nitro server plugin):
 * ```ts
 * import * as schema from '../database/schema'
 * import { registerDrizzleSchema } from '~/server/utils/dashboard/tables'
 * export default defineNitroPlugin(() => { registerDrizzleSchema(schema) })
 * ```
 *
 * After this call, any `pgTable(...)` export present in `schema` can be
 * reached via the generic dashboard routes — no manual FieldMeta needed.
 *
 * Multiple modules can call this function multiple times to register their
 * own drizzle schema alongside the main project one; in case of duplicate TS
 * export names, the earlier registration wins (which gives the main project
 * priority over modules).
 */
export function registerDrizzleSchema(schema: Record<string, unknown>): void {
  if (!SCHEMA_REGISTRY.includes(schema)) SCHEMA_REGISTRY.push(schema)
  // New schema may provide pivots / target tables that let us infer
  // many-to-many virtual columns for already-registered manual TABLES[]
  // entries (roles/users/files/…).  Re-apply now so later
  // getRegisteredTable() lookups see them.
  refreshManualTableM2MFields()
}

/** Re-run attachManyToManyVirtualFields on every non-custom TABLES[] entry.
 *  Safe to call repeatedly — attachManyToManyVirtualFields is idempotent. */
function refreshManualTableM2MFields(): void {
  for (const entry of TABLES) {
    if (!entry.meta || entry.meta.custom) continue
    entry.meta = attachManyToManyVirtualFields(entry.meta)
  }
}

/** Internal-only Drizzle symbols / helpers — inferred types */
type AnyPgTable = PgTableWithColumns<any>
function getTableNameSymbol(tbl: AnyPgTable): string | undefined {
  // Drizzle attaches the SQL table name via Symbol.for('drizzle:Name')
  return (tbl as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')]
}
function isPgTable(v: unknown): v is AnyPgTable {
  if (!v || typeof v !== 'object') return false
  return typeof getTableNameSymbol(v as AnyPgTable) === 'string'
}

/**
 * Heuristic: map a Drizzle PgColumn's `dataType` + `columnType` into the
 * FieldType that the generic CRUD UI knows how to render.  This is lossy —
 * if you need richer hints (select/relation/password/image/tags etc.), just
 * fall back to a manual registerDashboardTable() entry for that table.
 */
function inferFieldType(col: PgColumn): FieldType {
  // col.columnType is e.g. "PgVarchar", "PgText", "PgBoolean", "PgInteger",
  // "PgSerial", "PgTimestamp", "PgDateString", "PgJson", "PgJsonb", "PgUuid" …
  const ct = (col as unknown as { columnType?: string }).columnType ?? ''
  const dt = (col as unknown as { dataType?: string }).dataType ?? ''

  // --- Boolean ---
  if (ct === 'PgBoolean') return 'boolean'
  if (dt === 'boolean') return 'boolean'

  // --- Number / integer / serial ---
  if (/^(Pg(Smallint|Integer|Bigint|Serial|SmallSerial|BigSerial|DoublePrecision|Real|Numeric))$/.test(ct)) {
    return 'number'
  }
  if (dt === 'number') return 'number'

  // --- Date / datetime ---
  // Drizzle ships with multiple date variants depending on the driver:
  // PgDate, PgDateString, PgDateUtc, PgTimestamp, PgTimestamptz, PgTimestampUtc …
  if (/^PgDate(?!T)/.test(ct)) return 'date'    // "not T" → exclude PgDateTime*
  if (/^PgTimestamp/.test(ct)) return 'datetime'
  if (dt === 'date') return 'date'

  // --- JSON ---
  if (ct === 'PgJson' || ct === 'PgJsonb') return 'json'
  if (dt === 'json') return 'json'

  // --- Textarea for `text` columns (typically long-form) ---
  if (ct === 'PgText') return 'textarea'

  // Default: everything else (varchar, uuid, char, arrays of text …)
  // is treated as a single-line text input.
  return 'text'
}

/** Humanise a camelCase or snake_case column key into a readable label.
 *  NOTE: i18n happens in the frontend via t(`dashboard.fields.${key}`); the
 *  label here is only a fallback for unknown / newly-introduced tables. */
function keyToLabel(key: string): string {
  // snake_case → space-separated words
  const spaced = key
    .replace(/_/g, ' ')
    // camelCase boundaries — insert a space before capital letters
    .replace(/([a-z0-9])([A-Z])/g, (_m, a, b) => `${a} ${b}`)
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Auto-discover a single table across all registered schemas.
 *
 * Lookup order:
 *   1. Match a schema export whose TS name exactly equals `name`
 *      (e.g. `roles` → `export const roles = pgTable(...)`)
 *   2. Match a schema export whose drizzle SQL table name matches `name`
 *      (e.g. `"users"` matches `pgTable('users', {...})` regardless of
 *      the export alias)
 *
 * Returns a RegisteredTable object on success, null on failure.
 */
function findTableByName(name: string): { schema: Record<string, unknown>; exportKey: string; table: AnyPgTable } | null {
  for (const schema of SCHEMA_REGISTRY) {
    for (const [exportKey, value] of Object.entries(schema)) {
      if (!isPgTable(value)) continue
      if (exportKey === name) return { schema, exportKey, table: value }
      if (getTableNameSymbol(value) === name) return { schema, exportKey, table: value }
    }
  }
  return null
}

// Columns that are almost never user-editable directly AND are usually
// hidden from the list view.  Explicitly excludes `id` because admins
// typically want to see the primary-key column for row referencing.
const AUDIT_TIMESTAMP_KEY_RE = /^(createdAt|created_at|updatedAt|updated_at|deletedAt|deleted_at)$/i

// Simple plural/singular rules — covers the 95% common English cases used
// in internal DB naming.  Not linguistically perfect; avoids pulling an
// extra inflection dep.
export function pluralize(word: string): string {
  if (!word) return word
  const w = word
  // -s/-x/-z/-ch/-sh → +es
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`
  // consonant + y → y → ies
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`
  return `${w}s`
}
export function singularize(word: string): string {
  if (!word) return word
  const w = word
  // consonant+y + ies → y
  if (/ies$/i.test(w)) return `${w.slice(0, -3)}y`
  // Words ending in s/x/z/ch/sh pluralize by adding "es". Try stripping
  // "es" first, then verify the candidate base still ends in the expected
  // "adds es" consonant(s). That way:
  //   bus→buses → [buse base=bus] OK
  //   box→boxes → [boxe base=box] OK
  //   church→churches → [churche base=church] OK
  //   wish→wishes → [wishe base=wish] OK
  //   class→classes → [classe base=class] OK
  //   size→sizes → [size base=siz?] NO — fall through; fallback will still
  //     return 'size' by just stripping trailing 's' on 'sizes'.
  //   phrases → *phras* isn't our rule; fall through correctly.
  if (/es$/i.test(w)) {
    const candidate = w.slice(0, -2)
    if (/(s|x|z|ch|sh)$/i.test(candidate)) return candidate
  }
  // Regular +s plural (roles, users, templates, files, sizes): just strip
  // the trailing 's'.
  if (/s$/i.test(w)) return w.slice(0, -1)
  return w
}

/** Given a key ending with `_id` (or `Id`), return the related-table lookup
 *  name.  E.g. `user_id` / `userId` → "users"; `template_id` → "templates". */
export function relationTargetFromForeignKey(fkKey: string): { table: string; labelKey: string; valueKey: string } {
  let base = fkKey
  if (base.endsWith('_id')) base = base.slice(0, -3)
  else if (base.endsWith('Id') && base.length > 2) base = base.slice(0, -2)
  const words = base.replace(/([a-z0-9])([A-Z])/g, '$1_$2').split('_').filter(Boolean)
  const lastWord = words[words.length - 1] ?? base
  const table = pluralize(lastWord.toLowerCase())
  return { table, labelKey: 'name', valueKey: 'id' }
}

/** Describe a pivot table linking two registered tables. */
export interface PivotRelation {
  pivotTable: string                // registered / auto-discovered pivot name
  leftTable: string                 // e.g. "templates"
  leftFkKey: string                 // e.g. "templateId"
  rightTable: string                // e.g. "users"
  rightFkKey: string                // e.g. "userId"
}

/** Walk every drizzle table in the schema registry and identify pivot tables:
 *  any table whose non-id/non-timestamp columns consist of exactly TWO
 *  `*_id` foreign keys pointing to distinct registered tables.
 *  Returns all such pivots. */
export function discoverAllPivotRelations(): PivotRelation[] {
  const out: PivotRelation[] = []
  for (const schema of SCHEMA_REGISTRY) {
    for (const [exportKey, value] of Object.entries(schema)) {
      if (!isPgTable(value)) continue
      const cols = getTableColumns(value as unknown as AnyPgTable) as Record<string, PgColumn>
      const colKeys = Object.keys(cols)
      // Find candidate *_id / *Id columns that aren't the PK id column.
      const fkCols = colKeys.filter(k => {
        if (k === 'id') return false
        return k.endsWith('_id') || (/Id$/.test(k) && k.length > 2)
      })
      if (fkCols.length !== 2) continue
      // The rest of columns must be only id + well-known audit timestamps;
      // otherwise it's a business table not a pure pivot.
      const noise = colKeys.filter(k =>
        k !== 'id' && !fkCols.includes(k) && !AUDIT_TIMESTAMP_KEY_RE.test(k),
      )
      if (noise.length > 0) continue
      // Both fks must map to a target table that exists as a registered/
      // auto-discoverable drizzle table in this registry.
      const leftFkKey = fkCols[0] as string
      const rightFkKey = fkCols[1] as string
      const t0 = relationTargetFromForeignKey(leftFkKey)
      const t1 = relationTargetFromForeignKey(rightFkKey)
      if (!findTableByName(t0.table) || !findTableByName(t1.table)) continue
      const pivotTable = (getTableNameSymbol(value as unknown as AnyPgTable) ?? exportKey) as string
      out.push({
        pivotTable,
        leftTable: t0.table,
        leftFkKey,
        rightTable: t1.table,
        rightFkKey,
      })
    }
  }
  return out
}

/** For a given table, find all pivots that reference it and return virtual
 *  `many-to-many` FieldMeta entries + PivotRelation info so crudService /
 *  meta API can populate the form as multi-select and sync the pivot on
 *  save. */
export function discoverManyToManyForTable(tableName: string): Array<{ field: FieldMeta; pivot: PivotRelation; otherSide: string }> {
  const pivots = discoverAllPivotRelations()
  const out: ReturnType<typeof discoverManyToManyForTable> = []
  for (const p of pivots) {
    let side: 'left' | 'right' | null = null
    if (p.leftTable === tableName) side = 'left'
    else if (p.rightTable === tableName) side = 'right'
    if (!side) continue
    const other = side === 'left' ? { table: p.rightTable, key: p.rightFkKey } : { table: p.leftTable, key: p.leftFkKey }
    const target = relationTargetFromForeignKey(other.key)
    // virtual field key: singular other side + "Ids"  e.g. users → userIds
    const sing = singularize(other.table)
    const fieldKey = `${sing}Ids`
    const fm: FieldMeta = {
      key: fieldKey,
      label: `${keyToLabel(other.table)} (many-to-many)`,
      type: 'many-to-many',
      nullable: true,
      editable: true,
      showInForm: true,
      showInTable: false,
      showInDetail: true,
      relation: {
        table: target.table,
        labelKey: target.labelKey || 'name',
        valueKey: target.valueKey || 'id',
      },
      // Optional: mark as UI-only virtual column. crudService reads this
      // to skip it for insert/update (and handle it via pivot instead).
    }
    out.push({ field: fm, pivot: p, otherSide: other.table })
  }
  return out
}

/** Extend an auto-discovered meta with virtual many-to-many fields from
 *  any pivots that touch this table. Called from autoDiscoverTable /
 *  getTableMeta to avoid modifying callers.
 *
 *  Idempotent: any existing many-to-many field whose key matches an
 *  "extras" candidate is left untouched so repeated calls won't duplicate.
 */
export function attachManyToManyVirtualFields(meta: TableMeta): TableMeta {
  const extras = discoverManyToManyForTable(meta.table)
  if (!extras.length) return meta
  const existingKeys = new Set(meta.fields.map(f => f.key))
  const newOnes = extras.filter(e => !existingKeys.has(e.field.key))
  if (!newOnes.length) return meta
  return {
    ...meta,
    fields: [...meta.fields, ...newOnes.map(e => e.field)],
  }
}

// (Top-level attachment removed: when tables.ts finishes evaluating,
// SCHEMA_REGISTRY is still empty because registerDrizzleSchema hasn't been
// called by the consuming app/plugin yet. The attachment is now done
// eagerly inside registerDrizzleSchema() and lazily inside
// getRegisteredTable() — see refreshManualTableM2MFields().)

/** Apply naming-convention based overrides to a constructed FieldMeta:
 *  - `_url` / `Url` suffix → hyperlink type (renders as <a target="_blank">)
 *  - `_img` / `Image` suffix → image type (renders <img> tag + upload slot)
 *  - `_id` / `Id` suffix  → relation type (renders a USelect dropdown with
 *                           options pulled from the inferred target table) */
function applyFieldNamingHints(fm: FieldMeta) {
  const key = fm.key
  // Hyperlink
  if (key.endsWith('_url') || /Url$/.test(key)) {
    fm.type = 'hyperlink'
    return
  }
  // Image
  if (key.endsWith('_img') || key.endsWith('_image') || /Img$/.test(key) || /Image$/.test(key)) {
    fm.type = 'image'
    return
  }
  // Foreign-key relation: skip the fk end if this column is already marked
  // as the primary key (id) — auto-generated pk shouldn't become a select.
  const isFk = key.endsWith('_id') || (/Id$/.test(key) && key.length > 2)
  if (isFk && !(key === 'id')) {
    const { table, labelKey, valueKey } = relationTargetFromForeignKey(key)
    fm.type = 'relation'
    fm.relation = { table, labelKey, valueKey }
  }
}


/**
 * Build a full FieldMeta array for a PgTable based purely on its column
 * metadata.  Uses the column DECLARATION ORDER in the schema (that's what
 * Object.keys(getTableColumns(...)) returns), which is the most "natural"
 * default order for a generic CRUD UI.
 */
function inferFieldsFromTable(tbl: AnyPgTable): FieldMeta[] {
  const cols = getTableColumns(tbl) as Record<string, PgColumn>
  const fieldMetas: FieldMeta[] = []

  for (const key of Object.keys(cols)) {
    const col = cols[key] as PgColumn
    const notNull = Boolean((col as unknown as { notNull?: boolean }).notNull)
    const hasDefault = Boolean((col as unknown as { hasDefault?: boolean }).hasDefault)
    // Drizzle exposes primary-flag both as `primary` and `isPrimary` across
    // versions — check both defensively.
    const isPrimary = Boolean(
      (col as unknown as { primary?: boolean }).primary ||
      (col as unknown as { isPrimary?: boolean }).isPrimary
    )

    const type = inferFieldType(col)
    // "Auto-generated" = the DB produces the value without user input:
    //   * primary-key columns (serial/uuid pk) — column value is provided by DB
    //   * well-known audit-trail timestamp columns (createdAt / updatedAt / deletedAt)
    // A column with `default(x)` but NOT on that blocklist is still user-
    // editable — e.g. `status default 'todo'` or `priority default 0` —
    // they simply get their default when the user leaves the field blank.
    const autoGenerated = isPrimary || AUDIT_TIMESTAMP_KEY_RE.test(key)

    const fm: FieldMeta = {
      key,
      label: keyToLabel(key),
      type,
      nullable: !notNull,
      editable: !autoGenerated,
      showInForm: !autoGenerated,
      showInTable: !isPrimary,      // primary key columns are usually noise in list view
      showInDetail: true            // everything is interesting in the detail modal
    }

    // Some additional sensible defaults
    if (isPrimary) {
      fm.showInTable = true        // always show id column so users can reference rows
      fm.widthClass = 'w-16'
    }
    if (AUDIT_TIMESTAMP_KEY_RE.test(key)) {
      fm.showInTable = (key === 'createdAt' || key === 'updatedAt')
      fm.widthClass = 'w-40'
    }
    if (type === 'textarea') {
      fm.showInTable = false       // long-form text clobbers table columns
    }
    // REQUIRED validation — non-nullable + not-auto-generated means the
    // user MUST provide a value in the form.
    if (notNull && !autoGenerated && !hasDefault) {
      fm.validation = { required: true }
    } else if (notNull && !autoGenerated && hasDefault) {
      // E.g. `status default 'todo' not null`: field is user-editable and
      // NOT strictly required (DB will inject default on null submit).
    }

    applyFieldNamingHints(fm)

    fieldMetas.push(fm)
  }

  return fieldMetas
}

function inferTableFeatures(fields: FieldMeta[]) {
  const hasDeletedAt = fields.some(f => f.key === 'deletedAt' || f.key === 'deleted_at')
  // Search columns: text/textarea fields, excluding `id` (no one wants
  // full-text search on numeric id) and audit timestamps (not very
  // searchable as free text).
  const skipInSearch = /^(id|createdAt|created_at|updatedAt|updated_at|deletedAt|deleted_at)$/i
  const textCols = fields
    .filter(f => (f.type === 'text' || f.type === 'textarea') && !skipInSearch.test(f.key))
    .map(f => f.key)
    .slice(0, 3)
  const lastUpdatedField = fields.find(f => f.key === 'updatedAt' || f.key === 'updated_at')
  const fallbackSort = fields.find(f => f.key === 'id' || f.key === 'createdAt' || f.key === 'created_at')
  return {
    softDelete: hasDeletedAt,
    search: textCols,
    defaultSort: lastUpdatedField
      ? { field: lastUpdatedField.key, order: 'desc' as const }
      : fallbackSort
        ? { field: fallbackSort.key, order: 'desc' as const }
        : undefined
  }
}

/**
 * Build a RegisteredTable on-the-fly from a schema table.
 * Called as a fallback when no manual TABLES[] entry exists for `name`.
 *
 * The resulting RegisteredTable.getTable closure captures the found
 * PgTable reference directly (ignoring its schema parameter) so the rest
 * of the dashboard stack (resolveTable, crudService, filters etc.) works
 * without any awareness of which project registered the schema.
 */
export function autoDiscoverTable(name: string): RegisteredTable | null {
  const found = findTableByName(name)
  if (!found) return null
  const fields = inferFieldsFromTable(found.table)
  const sqlName = getTableNameSymbol(found.table) ?? found.exportKey
  let meta: TableMeta = {
    table: name,                 // preserve the caller's lookup name (URL)
    label: keyToLabel(sqlName),  // i18n frontend will override with t('dashboard.tables.X')
    icon: 'i-lucide-layout-grid',
    fields,
    features: inferTableFeatures(fields),
    custom: false,
  }
  meta = attachManyToManyVirtualFields(meta)
  const captured = found.table
  return { meta, getTable(_schema: Record<string, unknown>) { return captured } }
}

// ---------------- lookup overrides ----------------

/**
 * Look up a RegisteredTable by name.
 *
 * Priority:
 *   1. Explicit entry in TABLES[] (manual / registerDashboardTable)
 *   2. Auto-discovered entry from any registered Drizzle schema
 *   3. undefined → caller should 404
 */
export function getRegisteredTable(name: string): RegisteredTable | undefined {
  // Best-effort: in case any caller hits us before registerDrizzleSchema
  // has finished registering schemas in all plugins, try to refresh now.
  refreshManualTableM2MFields()
  const explicit = TABLES.find(t => t.meta.table === name)
  if (explicit) return explicit
  const auto = autoDiscoverTable(name)
  if (auto) {
    // Cache the auto-discovered result in TABLES so subsequent lookups are
    // free.  This also makes it show up in listAutoDiscoveredTables() if
    // someone wants to enumerate "all tables in the system".  We mark it
    // with a tiny Symbol flag so we can distinguish manual vs cached-auto
    // tables later (e.g. to decide whether to include in menu).
    TABLES.push(auto)
    return auto
  }
  return undefined
}

export function getRegisteredTables(): RegisteredTable[] {
  return TABLES
}

export function getTableMeta(name: string): TableMeta | undefined {
  return getRegisteredTable(name)?.meta
}

/**
 * Enumerate every PgTable currently reachable through any registered
 * Drizzle schema.  For each table that isn't already reachable through
 * `getRegisteredTable()` with a *distinct* name we emit its auto-built
 * RegisteredTable object.
 *
 * This enumeration intentionally INCLUDES tables that were cached into
 * TABLES[] by a prior `getRegisteredTable()` lookup — a "zero-config"
 * consumer (admin overview, table browser UI, tests …) wants to see ALL
 * reachable tables, whether first-discovered now or discovered earlier.
 *
 * Manually-registered tables ARE filtered out of the auto-discovered
 * list, so a consumer that wants to show "only non-trivial customised
 * tables" vs "auto-detected defaults" can tell the two apart.
 *
 * NOTE: default sidebar menu items are NOT added by this function —
 * entries there require an explicit opt-in (DEFAULT_MENU constant or
 * registerDashboardTable(opts.menuOrder)).
 */
export function listAllAutoDiscoverableTables(): RegisteredTable[] {
  const alreadyManual = new Set<string>(TABLES.map(t => t.meta.table))
  const result: RegisteredTable[] = []
  // Seen tracks (exportKey, sqlTableName) pairs so we don't emit the same
  // SQL table twice when it's reachable under multiple names.
  const seenSql = new Set<string>()
  const seenExport = new Set<string>()

  for (const schema of SCHEMA_REGISTRY) {
    for (const [exportKey, value] of Object.entries(schema)) {
      if (!isPgTable(value)) continue
      const sqlName = getTableNameSymbol(value) ?? exportKey
      if (seenExport.has(exportKey) || seenSql.has(sqlName)) continue
      seenExport.add(exportKey)
      seenSql.add(sqlName)

      // Prefer the lookup name that a human would type into the URL:
      //   1. TS exportKey (camelCase, e.g. `notificationReads`) – most common
      //   2. SQL table name if the export key has no manual registration
      const lookupName =
        alreadyManual.has(exportKey) ? exportKey :
        (alreadyManual.has(sqlName) ? sqlName : exportKey)

      // Use the canonical lookup path — this populates the TABLES[] cache
      // for future getRegisteredTable() calls too, so everybody sees the
      // same RegisteredTable instance for the same logical name.
      const reg = getRegisteredTable(lookupName)
      if (!reg) continue
      // Don't re-emit truly manual entries (TABLES[] defined above this
      // file line ~320) — they already "opt out" of auto-discovery by
      // virtue of being explicitly curated.
      if (alreadyManual.has(lookupName)) {
        // Detect whether the existing entry is actually the same object
        // identity as what we just built.  If yes → it WAS auto-cached
        // earlier and should appear in the auto list too.  We rely on a
        // tiny object-identity check: if `reg` is the first entry in
        // TABLES whose `.meta.table === lookupName` AND it was added
        // AFTER the initial manual TABLES[] array (i.e. it's cached-auto)
        // we consider it fair game.  For simplicity here: always emit
        // when lookupName === exportKey OR sqlName and `alreadyManual`
        // contains it ONLY because of a prior getRegisteredTable call —
        // we can tell that by checking TABLES.findIndex position vs
        // ORIGINAL_TABLES_LEN.
        const idx = TABLES.findIndex(t => t.meta.table === lookupName)
        if (idx < ORIGINAL_TABLES_LENGTH) continue   // truly manual → skip
      }
      // Otherwise (not originally manual) include it in the auto list,
      // dedup by (exportKey, sqlName) via seen sets above.
      const uniqueKey = `${exportKey}::${sqlName}`
      if (result.some(r => (r.meta.table === exportKey || r.meta.table === sqlName))) continue
      result.push(reg)
      void uniqueKey
    }
  }
  return result
}
