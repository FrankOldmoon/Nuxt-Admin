// Generic Drizzle-based CRUD query builder.
// Works against any table registered in server/utils/dashboard/tables.ts.
//
// Implementation notes:
// * We keep types intentionally loose (`any`, `Record<string, unknown>`) here
//   because the service is driven by metadata, not static TypeScript types.
//   The per-field coercion layer (see `castForDb`) takes care of basic
//   normalization before rows are handed to Drizzle for type-checked SQL.
// * All row-level identity lookups use an `id` column (either serial or
//   varchar) matching the metadata primary-key convention.

import type {
  AdvancedFilterCondition,
  FieldMeta,
  FieldOption,
  TableMeta,
  TableMetaWithOptions
} from '~/types/dashboard'
import { getRegisteredTable, discoverManyToManyForTable } from './tables'
import { db, schema } from '~~/server/utils/db'
import { resolveFileNamesByPath } from '~~/server/utils/files'
import {
  and,
  between,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notIlike,
  or,
  sql,
  asc
} from 'drizzle-orm'
import type { PgTableWithColumns, PgColumn } from 'drizzle-orm/pg-core'
import { createError } from 'h3'

// ---- many-to-many pivot helpers ----

function m2mEntries(meta: TableMeta): ReturnType<typeof discoverManyToManyForTable> {
  try { return discoverManyToManyForTable(meta.table) } catch { return [] }
}

/** For a many-to-many virtual field, load the related-ids array from the
 *  pivot table keyed on the base row's id. */
async function loadManyToManyIds(
  meta: TableMeta,
  fieldKey: string,
  baseId: number | string,
): Promise<Array<number | string>> {
  const entries = m2mEntries(meta)
  const ent = entries.find(e => e.field.key === fieldKey)
  if (!ent) return []
  const pivot = getRegisteredTable(ent.pivot.pivotTable)
  if (!pivot) return []
  const pivotTbl = pivot.getTable(schema as unknown as Record<string, unknown>) as PgTableWithColumns<any> | undefined
  if (!pivotTbl) return []
  const isLeftSide = ent.pivot.leftTable === meta.table
  const ourFk = isLeftSide ? ent.pivot.leftFkKey : ent.pivot.rightFkKey
  const otherFk = isLeftSide ? ent.pivot.rightFkKey : ent.pivot.leftFkKey
  try {
    const ourCol = col(pivotTbl, ourFk)
    const otherCol = col(pivotTbl, otherFk) as PgColumn & { mapFromDriverValue?: (v: unknown) => unknown }
    const rows = await db
      .select({ other: otherCol })
      .from(pivotTbl)
      .where(eq(ourCol as any, baseId as any)) as Array<{ other: unknown }>
    return rows.map(r => r.other as (number | string)).filter(v => v !== null && v !== undefined)
  } catch {
    return []
  }
}

/** After a row is inserted or updated, sync its many-to-many virtual fields
 *  to the corresponding pivot table.  For update mode, existing pivot rows
 *  for the base id are first removed and then replaced; for insert mode we
 *  just append. */
async function syncManyToManyPivots(
  meta: TableMeta,
  baseId: number | string,
  payload: Record<string, unknown>,
  mode: 'insert' | 'update',
) {
  const entries = m2mEntries(meta)
  for (const ent of entries) {
    const rawIds = payload[ent.field.key]
    const ids: Array<number | string> = Array.isArray(rawIds)
      ? (rawIds as Array<number | string>).map(v => (typeof v === 'number' || typeof v === 'string' ? v : Number(v)))
        .filter(v => !Number.isNaN(v as number) && v !== '' && v !== null && v !== undefined)
      : []
    const pivotReg = getRegisteredTable(ent.pivot.pivotTable)
    if (!pivotReg) continue
    const pivotTbl = pivotReg.getTable(schema as unknown as Record<string, unknown>) as PgTableWithColumns<any> | undefined
    if (!pivotTbl) continue
    const isLeftSide = ent.pivot.leftTable === meta.table
    const ourFk = isLeftSide ? ent.pivot.leftFkKey : ent.pivot.rightFkKey
    const otherFk = isLeftSide ? ent.pivot.rightFkKey : ent.pivot.leftFkKey
    const ourCol = col(pivotTbl, ourFk)

    try {
      await db.transaction(async (tx) => {
        if (mode === 'update') {
          await tx.delete(pivotTbl).where(eq(ourCol as any, baseId as any))
        }
        if (ids.length > 0) {
          const rows = ids.map((otherId) => ({
            [ourFk]: typeof baseId === 'number' ? Number(baseId) : baseId,
            [otherFk]: typeof otherId === 'number' ? Number(otherId) : otherId,
          }))
          await tx.insert(pivotTbl).values(rows as any).onConflictDoNothing()
        }
      })
    } catch (e) {
      throw createError({ statusCode: 500, message: `Failed to sync ${ent.field.key}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
}

// ------- helpers -------

interface ListQuery {
  offset: number
  limit: number
  trashed?: boolean
  search?: string
  /** Legacy simple filters (from quick-filter slot).  Exact-match semantics,
   *  merged into conditions with AND so callers can mix the two. */
  filters?: Record<string, string>
  /** Structured advanced conditions */
  conditions?: AdvancedFilterCondition[]
  sort?: { field: string; order: 'asc' | 'desc' }
}

export interface ListResult<T = Record<string, unknown>> {
  rows: T[]
  total: number
}

function resolveTable(meta: TableMeta): PgTableWithColumns<any> {
  const reg = getRegisteredTable(meta.table)
  if (!reg) throw createError({ statusCode: 404, message: `Unknown table: ${meta.table}` })
  const tbl = reg.getTable(schema as unknown as Record<string, unknown>) as
    | PgTableWithColumns<any>
    | undefined
  if (!tbl) throw createError({ statusCode: 404, message: `Schema table not found: ${meta.table}` })
  return tbl
}

function col<T = PgColumn>(tbl: PgTableWithColumns<any>, name: string): T {
  const cols = getTableColumns(tbl) as Record<string, PgColumn>
  if (!cols[name]) {
    const sqlName = (tbl as unknown as Record<string | symbol, string>)[Symbol.for('drizzle:Name')] as string | undefined
    throw createError({ statusCode: 400, message: `Unknown column ${sqlName ?? 'table'}.${name}` })
  }
  return cols[name] as unknown as T
}

function parsePageQuery(query: Record<string, unknown>, meta: TableMeta) {
  const search = typeof query.search === 'string' && query.search.length > 0 ? query.search : undefined
  const filterKeys = meta.fields.map(f => f.key)
  // Legacy simple filters (per-column quick-select, e.g. files.vue mimeType filter)
  const filters: Record<string, string> = {}
  for (const k of filterKeys) {
    const v = query[k]
    if (typeof v === 'string' && v.length > 0) filters[k] = v
  }
  // Structured advanced conditions: ?conditions=JSON.stringify([{logic,field,op,value},...])
  let conditions: AdvancedFilterCondition[] | undefined
  if (typeof query.conditions === 'string' && query.conditions.length > 0) {
    try {
      const parsed = JSON.parse(query.conditions)
      if (Array.isArray(parsed)) conditions = parsed.filter(isCondition)
    } catch { /* ignore malformed JSON — conditions silently dropped */ }
  }
  // Explicit user sort takes precedence over the table's default sort.
  // When the user clicks a column header they send `sort` + `order` (asc|desc);
  // we must honor that requested order verbatim. Only fall back to the
  // table's defaultSort when no explicit sort field is supplied.
  const explicitSortField = typeof query.sort === 'string' && filterKeys.includes(query.sort)
    ? query.sort
    : undefined
  const explicitSortOrder = (query.order === 'desc' ? 'desc' : query.order === 'asc' ? 'asc' : undefined) as 'asc' | 'desc' | undefined
  let sort: { field: string; order: 'asc' | 'desc' } | undefined
  if (explicitSortField) {
    sort = { field: explicitSortField, order: explicitSortOrder ?? 'asc' }
  } else if (meta.features.defaultSort?.field) {
    sort = { field: meta.features.defaultSort.field, order: meta.features.defaultSort.order ?? 'asc' }
  }
  return { search, filters, conditions, sort }
}

function isCondition(x: unknown): x is AdvancedFilterCondition {
  if (!x || typeof x !== 'object') return false
  const c = x as Record<string, unknown>
  return typeof c.field === 'string' && typeof c.op === 'string'
    && (c.logic === undefined || c.logic === 'AND' || c.logic === 'OR')
}

/** Build a single-condition SQL expression (the per-row predicate inside
 *  buildWhere).  Returns undefined when the condition cannot be evaluated
 *  (bad field, missing value, unsupported combination etc.). */
function buildConditionExpr(
  meta: TableMeta,
  tbl: PgTableWithColumns<any>,
  cond: AdvancedFilterCondition
): any {
  const f = meta.fields.find(x => x.key === cond.field)
  if (!f) return undefined
  try {
    var c = col(tbl, cond.field)
  } catch {
    return undefined
  }
  const op = cond.op
  const raw = cond.value
  // Coerce common input representations
  const num = raw === null || raw === undefined || raw === '' ? NaN : Number(raw)
  const strVal = raw === null || raw === undefined ? '' : String(raw)

  // --- "No value" operators (NULL-check / length 0) are type-agnostic ---
  if (op === 'isNull') return isNull(c)
  if (op === 'isNotNull') return isNotNull(c)
  if (op === 'isEmpty') {
    return or(isNull(c), eq(c, f.type === 'json' ? sql`'[]'::jsonb` : ''))
  }
  if (op === 'isNotEmpty') {
    return and(isNotNull(c), ne(c, f.type === 'json' ? sql`'[]'::jsonb` : ''))
  }

  // --- between: value must be a 2-element [min,max] tuple ---
  if (op === 'between') {
    let min: unknown = raw
    let max: unknown = raw
    if (Array.isArray(raw) && raw.length >= 2) { [min, max] = raw }
    else if (typeof raw === 'string' && raw.startsWith('[')) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length >= 2) { [min, max] = arr }
      } catch { return undefined }
    }
    const cast = (x: unknown): unknown => {
      if (f.type === 'number' || f.type === 'relation' || f.type === 'select') return Number(x as any)
      return x
    }
    const mn = cast(min), mx = cast(max)
    if (mn === undefined || mx === undefined) return undefined
    return between(c, mn, mx)
  }

  // --- JSONB array contains for "tags" / json-keyed-with-tags fields ---
  if ((f.type === 'tags') || (f.type === 'json' && f.key.toLowerCase().includes('tags'))) {
    if (op === 'contains' && strVal !== '') return sql`${c} @> ${JSON.stringify([strVal])}::jsonb`
    if (op === 'notContains' && strVal !== '') return sql`NOT (${c} @> ${JSON.stringify([strVal])}::jsonb)`
    return undefined
  }

  // --- Boolean specific ops (treat as eq/neq with boolean values) ---
  if (f.type === 'boolean') {
    const boolVal = raw === true || raw === 'true' || raw === 1 || raw === '1'
    if (op === 'eq') return eq(c, boolVal)
    if (op === 'neq') return ne(c, boolVal)
    return undefined
  }

  // --- Numeric-like (number, relation, select) ops ---
  if (f.type === 'number' || f.type === 'relation' || f.type === 'select') {
    if (Number.isNaN(num)) return undefined
    switch (op) {
      case 'eq': return eq(c, num)
      case 'neq': return ne(c, num)
      case 'gt': return gt(c, num)
      case 'gte': return gte(c, num)
      case 'lt': return lt(c, num)
      case 'lte': return lte(c, num)
      case 'contains': return ilike(sql`${c}::text`, `%${strVal}%`)
      case 'notContains': return notIlike(sql`${c}::text`, `%${strVal}%`)
      default: return undefined
    }
  }

  // --- Date / datetime ops (accept ISO strings from the client) ---
  if (f.type === 'date' || f.type === 'datetime') {
    if (strVal === '' && (op === 'eq' || op === 'neq' || op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte')) return undefined
    const d = f.type === 'date'
      ? (typeof raw === 'string' ? sql`${strVal}::date` : raw)
      : (typeof raw === 'string' ? new Date(strVal) : raw)
    switch (op) {
      case 'eq': return eq(c, d as any)
      case 'neq': return ne(c, d as any)
      case 'gt': return gt(c, d as any)
      case 'gte': return gte(c, d as any)
      case 'lt': return lt(c, d as any)
      case 'lte': return lte(c, d as any)
      default: return undefined
    }
  }

  // --- Text-like ops (text, textarea, password, image, hyperlink, select-unknown fallback) ---
  switch (op) {
    case 'eq': return eq(c, strVal)
    case 'neq': return ne(c, strVal)
    case 'contains': return ilike(c, `%${strVal}%`)
    case 'notContains': return notIlike(c, `%${strVal}%`)
    case 'startsWith': return ilike(c, `${strVal}%`)
    case 'endsWith': return ilike(c, `%${strVal}`)
    default: return undefined
  }
}

function buildWhere(
  meta: TableMeta,
  tbl: PgTableWithColumns<any>,
  opts: { search?: string; filters?: Record<string, string>; conditions?: AdvancedFilterCondition[]; trashed?: boolean }
) {
  // 1) System conditions — always AND: soft-delete, fulltext search
  const systemConditions: any[] = []
  if (meta.features.softDelete) {
    try {
      const deletedAtCol = col(tbl, 'deletedAt')
      if (opts.trashed) systemConditions.push(isNotNull(deletedAtCol))
      else systemConditions.push(isNull(deletedAtCol))
    } catch { /* ignore */ }
  }
  if (opts.search && meta.features.search.length > 0) {
    const likes = meta.features.search.map(k => {
      try { return ilike(col(tbl, k), `%${opts.search!}%`) } catch { return undefined }
    }).filter(Boolean) as any[]
    if (likes.length) systemConditions.push(or(...likes))
  }

  // 2) Legacy simple filters — exact-match quick-select, treated as AND chain.
  //    Convert to synthetic conditions so they go through the same pipeline.
  const legacy: AdvancedFilterCondition[] = []
  if (opts.filters) {
    for (const [k, raw] of Object.entries(opts.filters)) {
      legacy.push({ logic: 'AND', field: k, op: defaultLegacyOp(meta, k), value: raw })
    }
  }

  // 3) Advanced user conditions chain respecting logic(AND/OR) ordering.
  //    Iterate conditions in order, building a left-associative tree:
  //      (((cond0 AND cond1) OR cond2) AND cond3) ...
  const user = [...legacy, ...(opts.conditions ?? [])].map(c => buildConditionExpr(meta, tbl, c)).filter(Boolean) as any[]

  let chain: any = undefined
  for (let i = 0; i < user.length; i++) {
    const expr = user[i]
    if (i === 0) { chain = expr; continue }
    const logic = (opts.conditions ?? [])[i - legacy.length]?.logic ?? 'AND'
    chain = logic === 'OR' ? or(chain!, expr) : and(chain!, expr)
  }

  // 4) Merge system AND user trees.  User-chain is always a single
  //    right-hand operand AND-ed with the system conditions.
  const all = [...systemConditions]
  if (chain !== undefined) all.push(chain)
  return all.length === 0 ? undefined : all.length === 1 ? all[0] : and(...all)
}

function defaultLegacyOp(meta: TableMeta, key: string): AdvancedFilterCondition['op'] {
  const f = meta.fields.find(x => x.key === key)
  if (!f) return 'contains'
  switch (f.type) {
    case 'boolean':
    case 'number':
    case 'relation':
    case 'select':
      return 'eq'
    default:
      return 'contains'
  }
}

// ------- row-level data scope (dataScope) -------

/** Context of the current actor, used to filter row-level data by role dataScope. */
export interface DataScopeActor {
  userId: number
  roleName: string
  dataScope: string
}

/** Convert a role-level AuthContext (logged-in user + role) into a data-scope actor
 *  context; returns undefined when there is no role (no restriction). */
export function toDataScopeActor(ctx: {
  user: { id: number }
  role: { name: string; dataScope?: string | null } | null
}): DataScopeActor | undefined {
  if (!ctx.role) return undefined
  return {
    userId: ctx.user.id,
    roleName: ctx.role.name,
    dataScope: ctx.role.dataScope || 'all',
  }
}

/**
 * Build the row-level data-scope WHERE condition:
 * - admin / dataScope='all' / dataScope not configured -> undefined (no restriction)
 * - 'self' -> ownerColumn = current user (or userTable -> id = current user)
 * Returns undefined when the role applies no row-level restriction on this table.
 */
async function buildDataScopeWhere(
  meta: TableMeta,
  tbl: PgTableWithColumns<any>,
  actor: DataScopeActor | undefined
): Promise<any> {
  if (!actor || actor.roleName === 'admin') return undefined
  const scope = actor.dataScope || 'all'
  if (scope === 'all') return undefined
  const ds = meta.features.dataScope
  if (!ds) return undefined

  if (scope === 'self') {
    if (ds.userTable) {
      try { return eq(col(tbl, 'id'), actor.userId) } catch { return undefined }
    }
    if (ds.ownerColumn) {
      try { return eq(col(tbl, ds.ownerColumn), actor.userId) } catch { return undefined }
    }
    return undefined
  }

  return undefined
}

/** Merge the caller's where with the data-scope condition (undefined means unrestricted). */
async function applyDataScope(
  meta: TableMeta,
  tbl: PgTableWithColumns<any>,
  actor: DataScopeActor | undefined,
  where: any
): Promise<any> {
  const scopeCond = await buildDataScopeWhere(meta, tbl, actor)
  if (!scopeCond) return where
  return where ? and(where, scopeCond) : scopeCond
}

// ------- public API -------

export async function listTableData<T = Record<string, unknown>>(
  meta: TableMeta,
  q: ListQuery,
  actor?: DataScopeActor
): Promise<ListResult<T>> {
  const tbl = resolveTable(meta)
  const where = await applyDataScope(meta, tbl, actor, buildWhere(meta, tbl, { search: q.search, filters: q.filters, conditions: q.conditions, trashed: q.trashed }))
  const orderByClauses: any[] = []
  if (q.sort) {
    try {
      const sortCol = col(tbl, q.sort.field)
      orderByClauses.push(q.sort.order === 'desc' ? desc(sortCol) : asc(sortCol))
    } catch { /* ignore invalid sort field */ }
  }
  // Fallback sort via id desc for deterministic pagination
  try {
    orderByClauses.push(desc(col(tbl, 'id')))
  } catch { /* ignore */ }

  const [countRows, rows] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(tbl).where(where),
    db.select().from(tbl).where(where).orderBy(...orderByClauses).limit(q.limit).offset(q.offset)
  ] as const)

  const total = Number(countRows[0]?.value ?? 0)
  return { rows: rows as T[], total }
}

export { parsePageQuery }

export async function getById<T = Record<string, unknown>>(meta: TableMeta, id: number | string, actor?: DataScopeActor): Promise<T | null> {
  const tbl = resolveTable(meta)
  const idCol = col(tbl, 'id')
  const base = eq(idCol, id as any)
  const where = await applyDataScope(meta, tbl, actor, base)
  const rows = await db.select().from(tbl).where(where).limit(1)
  const row = (rows[0] as Record<string, unknown> | undefined) ?? null
  if (!row) return null as T | null
  const m2m = meta.fields.filter(f => f.type === 'many-to-many')
  if (m2m.length === 0) return row as unknown as T
  for (const f of m2m) {
    row[f.key] = await loadManyToManyIds(meta, f.key, id)
  }
  return row as unknown as T
}

export async function insertRow(meta: TableMeta, payload: Record<string, unknown>, actor?: DataScopeActor): Promise<Record<string, unknown>> {
  const tbl = resolveTable(meta)
  // self data scope: force the owner column to the current user to prevent
  // creating data for others.
  if (actor && actor.roleName !== 'admin' && actor.dataScope === 'self') {
    const ownerCol = meta.features.dataScope?.ownerColumn
    if (ownerCol) {
      try {
        col(tbl, ownerCol)
        payload[ownerCol] = actor.userId
      } catch { /* ignore — skip if the column doesn't exist */ }
    }
  }
  throwOnInvalid(meta, payload, 'create')
  const inserted = await db.insert(tbl).values(castForDbInsert(meta, payload, new Date())).returning()
  const row = inserted[0] as Record<string, unknown>
  if (row && row.id !== undefined && meta.fields.some(f => f.type === 'many-to-many')) {
    await syncManyToManyPivots(meta, row.id as number | string, payload, 'insert')
    // Re-load the row so virtual m2m fields are populated for the caller
    return (await getById(meta, row.id as number | string, actor)) ?? row
  }
  return row
}

/**
 * Validate a form payload against each field's `meta.validation` rule
 * (required / minLength / maxLength / min / max / pattern). Throws an h3
 * 400 `createError` with a field→message map when any rule fails.
 *
 * Invoked on create and update so the backend enforces the same rules the
 * frontend shows. Fields without a `validation` block are left to the DB.
 */
export function throwOnInvalid(
  meta: TableMeta,
  payload: Record<string, unknown>,
  mode: 'create' | 'update' = 'create'
): void {
  const errors: Record<string, string> = {}
  for (const f of meta.fields) {
    const rule = f.validation
    if (!rule) continue
    const key = f.key
    const raw = payload[key]
    const v = (raw ?? '') as unknown
    const isEmpty = v === undefined || v === null || v === ''
    // On update, an omitted field means "leave unchanged" — only validate it
    // when the client actually sent a value (or when it's a create).
    if (mode === 'update' && !(key in payload)) continue

    if (rule.required && isEmpty) {
      errors[key] = `Field "${key}" is required`
      continue
    }
    if (isEmpty) continue // non-required empty → nothing else to check

    if (typeof v === 'string') {
      if (rule.minLength != null && v.length < rule.minLength) {
        errors[key] = `Field "${key}" must be at least ${rule.minLength} characters`
        continue
      }
      if (rule.maxLength != null && v.length > rule.maxLength) {
        errors[key] = `Field "${key}" must be at most ${rule.maxLength} characters`
        continue
      }
      if (rule.pattern && !new RegExp(rule.pattern).test(v)) {
        errors[key] = `Field "${key}" has an invalid format`
        continue
      }
    }

    if (f.type === 'number' && typeof v !== 'boolean') {
      const n = Number(v)
      if (!Number.isNaN(n)) {
        if (rule.min != null && n < rule.min) errors[key] = `Field "${key}" must be >= ${rule.min}`
        else if (rule.max != null && n > rule.max) errors[key] = `Field "${key}" must be <= ${rule.max}`
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation failed',
      message: Object.values(errors).join('; '),
      data: { fieldErrors: errors }
    })
  }
}

// ------- Generic type-driven seeding -------

/** Words used to build believable values for text-like seed fields. */
const SEED_WORDS = [
  'crimson', 'golden', 'misty', 'hollow', 'bright', 'distant', 'silent', 'radiant',
  'swift', 'gentle', 'wild', 'calm', 'ancient', 'modern', 'quiet', 'vivid'
]
const SEED_NOUNS = [
  'river', 'forest', 'mountain', 'city', 'garden', 'harbor', 'valley', 'meadow',
  'ocean', 'desert', 'village', 'castle', 'market', 'gallery', 'archive', 'studio'
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function seedText(): string {
  return `${pick(SEED_WORDS)} ${pick(SEED_NOUNS)}`
}
function seedUrl(): string {
  return `https://example.com/${pick(SEED_WORDS)}-${pick(SEED_NOUNS)}`
}

/**
 * Generate a single realistic payload row for a table, driven purely by the
 * field metadata (`FieldMeta.type`). Relation/select fields pick from the
 * provided option lists; auto fields (id, createdAt, updatedAt, password) are
 * skipped so the generic insert fills them.
 */
export function makeSeedRow(meta: TableMeta, options: Record<string, FieldOption[]>, index: number): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const f of meta.fields) {
    if (!f.showInForm || !f.editable) continue
    if (f.type === 'many-to-many') continue
    if (['id'].includes(f.key)) continue
    if (['password', 'createdAt', 'updatedAt', 'deletedAt'].includes(f.key)) continue

    const opts = (f.type === 'select' || f.type === 'relation')
      ? (options[f.key] ?? f.options ?? [])
      : (f.options ?? [])

    switch (f.type) {
      case 'text':
      case 'textarea':
        payload[f.key] = `${seedText()} ${f.key}-${index}`
        break
      case 'richEditor':
        payload[f.key] = {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `${seedText()} ${index}` }] },
            { type: 'paragraph', content: [{ type: 'text', text: `This is seeded rich text content for the **${f.key}** field (row ${index}).` }] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A bullet point' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Another bullet point' }] }] }
            ] }
          ]
        }
        break
      case 'hyperlink':
        payload[f.key] = seedUrl()
        break
      case 'number':
        payload[f.key] = randInt(1, 999)
        break
      case 'boolean':
        payload[f.key] = Math.random() > 0.5
        break
      case 'date':
        payload[f.key] = new Date(Date.now() - randInt(1, 365 * 3) * 86400000)
        break
      case 'datetime':
        payload[f.key] = new Date(Date.now() - randInt(0, 365 * 3) * 86400000)
        break
      case 'time':
        payload[f.key] = '00:00'
        break
      case 'image':
      case 'file':
      case 'files':
        payload[f.key] = null
        break
      case 'tags': {
        const count = randInt(1, 4)
        const arr: string[] = []
        for (let i = 0; i < count; i++) arr.push((f.options?.[i]?.value ?? pick(SEED_WORDS)).toString())
        payload[f.key] = arr
        break
      }
      case 'json':
        payload[f.key] = { [f.key]: index, note: seedText() }
        break
      case 'select':
      case 'relation': {
        const value = opts[randInt(0, Math.max(0, opts.length - 1))]?.value
        payload[f.key] = value == null ? null : value
        break
      }
      default:
        payload[f.key] = `${seedText()} ${index}`
    }
  }
  return payload
}

/** Seed `count` rows into `meta`'s table using type-driven values. Returns the inserted ids. */
export async function seedTable(
  meta: TableMeta,
  count: number,
  actor?: DataScopeActor,
  relationOptions?: Record<string, FieldOption[]>,
  visited: Set<string> = new Set()
): Promise<Array<number | string>> {
  // Plan B for relations: before seeding this table, ensure every related
  // table (via `relation` fields) has at least one row. If a referenced table
  // is empty, seed it first (recursively) so relation fields can pick a real
  // value instead of silently becoming null (e.g. posts.categoryId when the
  // categories table is empty). `visited` prevents infinite recursion between
  // mutually-referencing tables.
  if (visited.has(meta.table)) return []
  visited.add(meta.table)

  // Related tables we may need to backfill. The host `users` table is excluded:
  // it has NOT NULL password/username/email columns the generic seeder cannot
  // produce safely, and owner relations (e.g. posts.authorId) are filled by the
  // dataScope ownerColumn instead.
  const related = new Set<string>()
  for (const f of meta.fields) {
    if (f.type !== 'relation' || !f.relation) continue
    const relTable = f.relation.table
    if (relTable === 'users') continue
    const reg = getRegisteredTable(relTable)
    if (reg && reg.meta.table !== meta.table) related.add(relTable)
  }

  // Backfill any related table that currently has zero rows, then re-query
  // the options so this table's relation fields see real values.
  for (const relTable of related) {
    const relReg = getRegisteredTable(relTable)
    if (!relReg || visited.has(relReg.meta.table)) continue
    const relTbl = relReg.getTable(schema as unknown as Record<string, unknown>) as PgTableWithColumns<any> | undefined
    if (!relTbl) continue
    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(relTbl)
    if (Number(countRow?.c ?? 0) === 0) {
      await seedTable(relReg.meta, 3, actor, undefined, visited)
    }
  }

  const options = relationOptions ?? await loadRelationOptions(meta)

  // When the table has an owner column (e.g. posts.authorId), always assign it
  // to the seeding actor so seeded rows have an owner — never a null author.
  const ownerKey = meta.features.dataScope?.ownerColumn
  const ids: Array<number | string> = []
  for (let i = 0; i < count; i++) {
    const payload = makeSeedRow(meta, options, i)
    if (ownerKey && actor) payload[ownerKey] = actor.userId
    const row = await insertRow(meta, payload, actor)
    if (row && row.id !== undefined) ids.push(row.id as number | string)
  }
  return ids
}

export async function updateRow(meta: TableMeta, id: number | string, payload: Record<string, unknown>, actor?: DataScopeActor): Promise<Record<string, unknown> | null> {
  const tbl = resolveTable(meta)
  const idCol = col(tbl, 'id')
  throwOnInvalid(meta, payload, 'update')
  const now = new Date()
  const set = castForDbUpdate(meta, payload, now)
  // Snapshot the previous content into the row's `versions` history (if the
  // table opted in via `features.versions`) before applying the update.
  await addVersionSnapshot(meta, tbl, idCol, id, set, now)
  if (Object.keys(set).length > 0) {
    const where = await applyDataScope(meta, tbl, actor, eq(idCol, id as any))
    await db.update(tbl).set(set).where(where).returning()
  }
  if (meta.fields.some(f => f.type === 'many-to-many')) {
    await syncManyToManyPivots(meta, id, payload, 'update')
  }
  return getById(meta, id, actor)
}

/**
 * Version history snapshot. When a table opts in via `meta.features.versions`,
 * capture the previous value of each tracked field before an update touches any
 * of them. Snapshots are stored newest-first in the row's `versions` jsonb
 * column and capped at `max` (default 50), so an old item is never dropped from
 * history unless more than 50 versions accumulate.
 */
async function addVersionSnapshot(
  meta: TableMeta,
  tbl: PgTableWithColumns<any>,
  idCol: PgColumn,
  id: number | string,
  set: Record<string, unknown>,
  now: Date,
): Promise<void> {
  const cfg = meta.features?.versions
  if (!cfg || !cfg.fields?.length) return
  const changed = cfg.fields.filter(f => f in set)
  if (changed.length === 0) return
  const rows = await db.select().from(tbl).where(eq(idCol, id as any)).limit(1)
  const cur = rows[0] as Record<string, unknown> | undefined
  if (!cur) return
  const snapshot: Record<string, unknown> = { savedAt: now.toISOString() }
  for (const f of cfg.fields) snapshot[f] = cur[f] ?? null
  const existing = Array.isArray(cur.versions) ? (cur.versions as Record<string, unknown>[]) : []
  set.versions = [snapshot, ...existing].slice(0, cfg.max ?? 50)
}

/** Convert a string-keyed form payload into the types Drizzle expects.
 *
 *  Two modes (auto-selected based on payload + meta shape):
 *
 *  1. **Native mode (default)** — only keeps keys whose meta field has
 *     `showInForm && editable`, and applies per-type casting.  This is the
 *     safe default for tables using the generic form.
 *
 *  2. **Passthrough mode** — triggered when mode 1 produces an empty object
 *     yet the caller still supplied a non-empty payload.  This indicates
 *     the table uses a fully custom form (`#form-override` slot +
 *     `transformPayload` hook on `DashboardCrudPage`) — the payload is
 *     already validated & shaped client-side.  We still apply a safety
 *     whitelist: only keys that exist in the table's column set are kept
 *     (anything extra from the client is silently dropped).  JSON values
 *     are kept as-is because the client hook already sent JS objects.
 */
export function castForDbInsert(meta: TableMeta, payload: Record<string, unknown>, now: Date): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of meta.fields) {
    if (!f.showInForm || !f.editable) continue
    if (f.type === 'many-to-many') continue
    const raw = payload[f.key]
    if (raw === undefined || raw === null || raw === '') {
      if (f.nullable) out[f.key] = null
      continue
    }
    switch (f.type) {
      case 'number':
      case 'relation':
        out[f.key] = Number(raw)
        break
      case 'boolean':
        out[f.key] = raw === true || raw === 'true' || raw === 1 || raw === '1'
        break
      case 'date':
        out[f.key] = raw instanceof Date ? raw : new Date(String(raw))
        break
      case 'datetime':
        out[f.key] = raw instanceof Date ? raw : new Date(String(raw))
        break
      case 'tags': {
        out[f.key] = coerceTags(raw)
        break
      }
      case 'image':
      case 'file': {
        // Rows may carry file values as { path, fileName } (from
        // enrichFileFields); normalise back to a plain path for storage.
        out[f.key] = raw && typeof raw === 'object' && 'path' in (raw as Record<string, unknown>)
          ? String((raw as Record<string, unknown>).path)
          : (raw === '' || raw == null ? null : String(raw))
        break
      }
      case 'files': {
        // Multi-file column stores an array of paths.  Normalise elements
        // (enriched { path, fileName } objects → plain path) and coerce a
        // single string/object into a one-element array.
        const arr = Array.isArray(raw) ? raw : (raw == null || raw === '' ? [] : [raw])
        out[f.key] = arr.map((v: unknown) =>
          v && typeof v === 'object' && 'path' in (v as Record<string, unknown>)
            ? String((v as Record<string, unknown>).path)
            : String(v)
        )
        break
      }
      case 'json':
      case 'richEditor': {
        // richEditor fields store a Tiptap JSON document (object).
        if (typeof raw === 'string') {
          try { out[f.key] = JSON.parse(raw) } catch { out[f.key] = raw }
        } else {
          out[f.key] = raw
        }
        break
      }
      case 'password':
        break
      default:
        out[f.key] = String(raw)
    }
  }

  // ---- Passthrough fallback for custom-form tables ----
  if (Object.keys(out).length === 0 && Object.keys(payload).length > 0) {
    // Build whitelist: any known meta field key + actual drizzle column names
    const whitelist = new Set<string>(meta.fields.map(f => f.key))
    try {
      const tbl = resolveTable(meta)
      const cols = getTableColumns(tbl) as Record<string, unknown>
      for (const c of Object.keys(cols)) whitelist.add(c)
    } catch { /* ignore — fall back to meta keys only */ }

    for (const [k, v] of Object.entries(payload)) {
      if (!whitelist.has(k)) continue
      // Raw passthrough — client transformPayload already cast everything.
      // Still coerce `updatedAt` for safety if the caller forgot to send it.
      if (k === 'updatedAt' && !(v instanceof Date)) {
        out[k] = new Date(String(v))
      } else {
        out[k] = v
      }
    }
  }

  try { if (meta.fields.some(f => f.key === 'updatedAt')) out.updatedAt = now } catch { /* ignore */ }
  return out
}

/**
 * Enrich `file`/`files`-typed fields on result rows with the original upload
 * filename. Columns store a storage path (or an array of paths); we
 * batch-lookup the `files.originalName` so table/details can display a
 * human-readable name while still linking by path.  Values become
 * `{ path, fileName }` (or arrays thereof); rows without matches are
 * returned untouched.
 */
export async function enrichFileFields(
  meta: TableMeta,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const ff = meta.fields.filter(f => f.type === 'file' || f.type === 'files' || f.type === 'image')
  if (!ff.length || !rows.length) return rows
  const paths: string[] = []
  const collect = (v: unknown) => {
    if (typeof v === 'string' && v && !paths.includes(v)) paths.push(v)
  }
  for (const row of rows) {
    for (const f of ff) {
      const v = row[f.key]
      if (f.type === 'files') {
        if (Array.isArray(v)) v.forEach(collect)
      } else {
        collect(v)
      }
    }
  }
  if (!paths.length) return rows
  const map = await resolveFileNamesByPath(paths)
  if (map.size === 0) return rows
  const enrichOne = (v: unknown): unknown =>
    typeof v === 'string' && map.has(v) ? { path: v, fileName: map.get(v) } : v
  return rows.map((row) => {
    const next = { ...row }
    for (const f of ff) {
      const v = next[f.key]
      if (f.type === 'files') {
        if (Array.isArray(v)) next[f.key] = v.map(enrichOne)
      } else {
        next[f.key] = enrichOne(v)
      }
    }
    return next
  })
}

/**
 * Normalise a `tags`-typed value into a string array for JSONB storage.
 * Accepts every shape a client could send:
 *   - real array:              ['new','hot']
 *   - JSON array string:       '["new","hot"]'
 *   - comma/space separated:   'new,hot'   /   'new hot new,hot'
 * Falls back to `[]` for anything else.
 */
export function coerceTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* not a JSON array — fall through to splitting */ }
    return s.split(/[,，\s]+/).filter(Boolean)
  }
  return []
}

/** Same as insert, but skip any keys not present in the payload.
 *  Passthrough-mode also works here (see castForDbInsert above). */
export function castForDbUpdate(meta: TableMeta, payload: Record<string, unknown>, now: Date): Record<string, unknown> {
  // First, try the showInForm+editable filter for native form tables
  const filtered: Record<string, unknown> = {}
  const hasAnyNativeField = meta.fields.some(f => f.showInForm && f.editable)
  if (hasAnyNativeField) {
    for (const [k, v] of Object.entries(payload)) {
      const field = meta.fields.find(f => f.key === k)
      if (!field || !field.editable || !field.showInForm) continue
      filtered[k] = v
    }
  }
  const updated = castForDbInsert(meta, Object.keys(filtered).length ? filtered : payload, now)
  try {
    if (meta.fields.some(f => f.key === 'updatedAt')) updated.updatedAt = now
  } catch { /* ignore */ }
  return updated
}

export async function softDeleteRow(meta: TableMeta, id: number | string, actor?: DataScopeActor): Promise<number> {
  if (!meta.features.softDelete) throw createError({ statusCode: 405, message: 'Table does not support soft delete' })
  const tbl = resolveTable(meta)
  const idCol = col(tbl, 'id')
  const deletedAtCol = col(tbl, 'deletedAt')
  const where = await applyDataScope(meta, tbl, actor, eq(idCol, id as any))
  const res = await db.update(tbl).set({ [deletedAtCol.name as any]: new Date() } as any).where(where)
  return Number(res.rowCount ?? 0)
}

export async function restoreRow(meta: TableMeta, id: number | string, actor?: DataScopeActor): Promise<number> {
  if (!meta.features.softDelete) throw createError({ statusCode: 405, message: 'Table does not support soft delete' })
  const tbl = resolveTable(meta)
  const idCol = col(tbl, 'id')
  const deletedAtCol = col(tbl, 'deletedAt')
  const where = await applyDataScope(meta, tbl, actor, eq(idCol, id as any))
  const res = await db.update(tbl).set({ [deletedAtCol.name as any]: null } as any).where(where)
  return Number(res.rowCount ?? 0)
}

export async function permanentDeleteRow(meta: TableMeta, id: number | string, actor?: DataScopeActor): Promise<number> {
  const tbl = resolveTable(meta)
  const idCol = col(tbl, 'id')
  const where = await applyDataScope(meta, tbl, actor, eq(idCol, id as any))
  const res = await db.delete(tbl).where(where)
  return Number(res.rowCount ?? 0)
}

export async function applyBatch(meta: TableMeta, action: 'soft-delete' | 'restore' | 'permanent-delete', ids: Array<number | string>, actor?: DataScopeActor): Promise<number> {
  if (!ids.length) return 0
  const tbl = resolveTable(meta)
  const idCol = col(tbl, 'id')
  const base = inArray(idCol, ids as any)
  const where = await applyDataScope(meta, tbl, actor, base)
  if (action === 'soft-delete') {
    if (!meta.features.softDelete) throw createError({ statusCode: 405, message: 'Table does not support soft delete' })
    // Verify the column exists; use the JS property name ('deletedAt') as the
    // SET key — Drizzle expects JS property keys, NOT SQL column names (.name).
    col(tbl, 'deletedAt')
    const res = await db.update(tbl).set({ deletedAt: new Date() } as any).where(where)
    return Number(res.rowCount ?? 0)
  }
  if (action === 'restore') {
    if (!meta.features.softDelete) throw createError({ statusCode: 405, message: 'Table does not support soft delete' })
    col(tbl, 'deletedAt')
    const res = await db.update(tbl).set({ deletedAt: null } as any).where(where)
    return Number(res.rowCount ?? 0)
  }
  // permanent-delete
  const res = await db.delete(tbl).where(where)
  return Number(res.rowCount ?? 0)
}

/** Load option lists for `relation` / `select` fields so the frontend can
 *  render dropdowns without additional requests. */
export async function loadRelationOptions(meta: TableMeta): Promise<Record<string, FieldOption[]>> {
  const out: Record<string, FieldOption[]> = {}
  const relations = meta.fields.filter((f): f is FieldMeta & { relation: NonNullable<FieldMeta['relation']> } => !!f.relation)
  await Promise.all(
    relations.map(async (f) => {
      const reg = getRegisteredTable(f.relation.table)
      if (!reg) {
        out[f.key] = []
        return
      }
      const otherTbl = reg.getTable(schema as unknown as Record<string, unknown>) as PgTableWithColumns<any> | undefined
      if (!otherTbl) { out[f.key] = []; return }
      try {
        const labelCol = col(otherTbl, f.relation.labelKey)
        const valueCol = col(otherTbl, f.relation.valueKey)
        const rows = await db.select({ label: labelCol, value: valueCol }).from(otherTbl).orderBy(asc(valueCol)) as Array<{ label: unknown, value: unknown }>
        out[f.key] = rows.map(r => ({ label: String(r.label ?? ''), value: r.value as (string | number | null) }))
      } catch {
        out[f.key] = []
      }
    })
  )
  for (const f of meta.fields) {
    if (f.type === 'select' && f.options) out[f.key] = f.options
  }
  return out
}

export function attachOptions(meta: TableMeta, options: Record<string, FieldOption[]>): TableMetaWithOptions {
  return { ...meta, relationOptions: options }
}

// ---------- Import / Export (Excel-compatible 2D string rows) ----------

export interface ImportBatchResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ row: number; key: string; error: string }>
}

/** Return the ordered list of column keys that are importable / exportable
 *  (form-visible, not auto-generated ids / timestamps). */
export function ioFieldKeys(meta: TableMeta): string[] {
  return meta.fields
    .filter((f) => f.type !== 'many-to-many')
    .filter((f) => {
      if (f.key === 'id') return false
      if (!f.editable) return false
      return f.showInForm !== false
    })
    .map((f) => f.key)
}

/** Convert a 2D import sheet (header row already stripped) to per-row objects
 *  keyed by field keys. Values remain as strings — will be coerced by
 *  castForDbInsert on each row. */
export function sheetRowsToObjects(
  meta: TableMeta,
  rows: string[][],
  keys = ioFieldKeys(meta),
): Array<Record<string, string>> {
  return rows.map((row) => {
    const obj: Record<string, string> = {}
    keys.forEach((k, i) => {
      const v = row[i]
      if (v !== undefined && v !== '') obj[k] = v
    })
    return obj
  })
}

/** Convert DB rows to a 2D string array suitable for CSV / sheet export.
 *  Relation / select columns are rendered using loaded relationOptions. */
export function rowsToSheetRows(
  meta: TableMeta,
  rows: Record<string, unknown>[],
  options?: Record<string, FieldOption[]>,
  keys = ioFieldKeys(meta),
): { headers: string[]; sheet: string[][] } {
  const headers = keys.map((k) => {
    const f = meta.fields.find(x => x.key === k)
    return f?.label ?? k
  })
  const sheet: string[][] = rows.map((row) =>
    keys.map((k) => {
      const f = meta.fields.find(x => x.key === k)
      const raw = row[k]
      if (raw === null || raw === undefined) return ''
      if (f?.type === 'boolean') return raw ? 'true' : 'false'
      if (f?.type === 'date' || f?.type === 'datetime') {
        if (raw instanceof Date) return raw.toISOString().slice(0, f.type === 'date' ? 10 : 19).replace('T', ' ')
        return String(raw)
      }
      if (f?.type === 'select') {
        const arr = options?.[f.key]
        if (Array.isArray(arr)) {
          const opt = arr.find(o => String(o.value) === String(raw))
          return opt?.label ?? String(raw)
        }
      }
      if (f?.type === 'relation') {
        const arr = options?.[f.key]
        if (Array.isArray(arr)) {
          const opt = arr.find(o => String(o.value) === String(raw))
          return opt?.label ?? String(raw)
        }
      }
      if (f?.type === 'json') return typeof raw === 'string' ? raw : JSON.stringify(raw)
      return String(raw)
    }),
  )
  return { headers, sheet }
}

/** Generic batch importer: loops over 2D sheet rows, coerces each to a DB
 *  payload, and inserts them one-by-one (tracking errors per row). */
export async function importSheetRows(
  meta: TableMeta,
  rows: string[][],
  actor?: DataScopeActor,
  maxBatch = 500,
): Promise<ImportBatchResult> {
  if (!Array.isArray(rows)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '"rows" array is required' })
  }
  if (rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No rows to import' })
  }
  if (rows.length > maxBatch) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `Max ${maxBatch} rows per import`,
    })
  }
  const keys = ioFieldKeys(meta)
  const objects = sheetRowsToObjects(meta, rows, keys)
  const now = new Date()
  const errors: ImportBatchResult['errors'] = []
  let succeeded = 0
  for (let i = 0; i < objects.length; i++) {
    const rowNum = i + 1
    const obj = objects[i] ?? {}
    const firstKey = keys[0]
    const key = firstKey ? ((obj as Record<string, unknown>)[firstKey] ?? '') : ''
    try {
      const payload = castForDbInsert(meta, obj as Record<string, unknown>, now)
      await insertRow(meta, payload, actor)
      succeeded++
    } catch (e: unknown) {
      errors.push({
        row: rowNum,
        key: String(key ?? ''),
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return {
    total: rows.length,
    succeeded,
    failed: errors.length,
    errors,
  }
}

