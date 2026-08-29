// Table customization registry.
//
// The OFFICIAL place for a table's custom list/CRUD behavior.  The generic
// `/api/dashboard/data/[table]/*` handlers dispatch here, so a table's custom
// API lives in its own file under `./tableOverrides/<table>.ts` — no shared
// handler files need editing per table.
//
// Two orthogonal extension points exist (a table uses at most one):
//
//  1. List-only enrichment  (`TableListOverride`) — wraps the GENERIC list
//     result (pagination / permissions / row-level data scope still handled
//     by crudService).  Used by `templates` for its L1 inventoryStatus switch.
//
//  2. Full-table takeover     (`TableCrudHandler`) — replaces individual CRUD
//     endpoints entirely (list/getOne/create/update/batch/import/upload).
//     The override receives the raw h3 `event` and is responsible for its own
//     auth (e.g. requireAdmin), param parsing, and response shape.  Used by
//     `users` / `files` which need richer business logic than the generic
//     metadata-driven CRUD (RBAC guardrails, role joins, file upload, …).
//
// Adding a custom API for a new table:
//   1. create `server/utils/dashboard/tableOverrides/myTable.ts` exporting a
//      `TableListOverride` or `TableCrudHandler` (see users.ts / files.ts /
//      templates.ts for worked examples), and
//   2. add ONE `import` + ONE `registerListOverride(...)` /
//      `registerTableHandler(...)` line below.
//
// (An import.meta.glob approach was tried, but Nitro's node runtime replaces
// `import.meta.glob` with an undefined helper, so a static registry is used —
// correct and reliably works in both dev and production bundling.)

import type { TableMeta } from '~/types/dashboard'
import type { H3Event } from 'h3'
import templatesOverride from './tableOverrides/templates'
import usersHandler from './tableOverrides/users'
import filesHandler from './tableOverrides/files'

/** List-only enrichment: wraps the generic list result (rows unchanged if no
 *  `list` hook is defined). */
export interface TableListOverride {
  /** Table name this override targets (URL-safe, e.g. 'templates'). */
  table: string
  /** Enrich list rows before they are returned / paginated. */
  list?: (
    rows: Record<string, unknown>[],
    meta: TableMeta,
  ) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>
}

/** Full-table takeover: each hook replaces one generic CRUD endpoint.  Hooks
 *  receive the raw h3 `event` and are responsible for auth / parsing / shape. */
export interface TableCrudHandler {
  table: string
  list?: (event: H3Event) => unknown
  getOne?: (event: H3Event) => unknown
  create?: (event: H3Event) => unknown
  update?: (event: H3Event) => unknown
  batch?: (event: H3Event) => unknown
  import?: (event: H3Event) => unknown
  upload?: (event: H3Event) => unknown
  seed?: (event: H3Event) => unknown
}

const enrichments = new Map<string, TableListOverride>()
const handlers = new Map<string, TableCrudHandler>()

// ---- List-only enrichment ----

export function registerListOverride(table: string, override: TableListOverride): void {
  if (enrichments.has(table)) return
  enrichments.set(table, override)
}

export function getTableListOverride(table: string): TableListOverride | undefined {
  return enrichments.get(table)
}

/** Apply a registered list override (if any) to `rows`, else return as-is. */
export async function applyListOverrides(
  table: string,
  rows: Record<string, unknown>[],
  meta: TableMeta,
): Promise<Record<string, unknown>[]> {
  const ov = getTableListOverride(table)
  if (!ov?.list) return rows
  return await ov.list(rows, meta)
}

// ---- Full-table takeover ----

export function registerTableHandler(handler: TableCrudHandler): void {
  if (handlers.has(handler.table)) return
  handlers.set(handler.table, handler)
}

export function getTableHandler(table: string): TableCrudHandler | undefined {
  return handlers.get(table)
}

// ---- Register every table whose custom API lives in ./tableOverrides/ ----
registerListOverride(templatesOverride.table, templatesOverride)
registerTableHandler(usersHandler)
registerTableHandler(filesHandler)