import { eq, desc, asc, count, inArray, isNull, isNotNull, and, ilike, or, gte, lte } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { db } from './db'
import { files } from '../database/schema'

export type FileRow = typeof files.$inferSelect

export interface FileFilters {
  search?: string
  mimeType?: string
  sizeMin?: string
  sizeMax?: string
}

export async function listFiles(userId: number, asAdmin: boolean): Promise<FileRow[]> {
  return asAdmin
    ? await db.select().from(files).orderBy(desc(files.id))
    : await db.select().from(files).where(eq(files.userId, userId)).orderBy(desc(files.id))
}

export async function listFilesPaged(userId: number, asAdmin: boolean, offset: number, limit: number, trashed = false, filters?: FileFilters, sort?: { field: string; order: 'asc' | 'desc' }): Promise<{ rows: FileRow[], total: number }> {
  const conds = [trashed ? isNotNull(files.deletedAt) : isNull(files.deletedAt)]
  if (!asAdmin) conds.push(eq(files.userId, userId))
  if (filters?.search) {
    const pat = `%${filters.search}%`
    conds.push(or(ilike(files.originalName, pat), ilike(files.filename, pat))!)
  }
  if (filters?.mimeType) conds.push(ilike(files.mimeType, `${filters.mimeType}%`))
  if (filters?.sizeMin) {
    const n = Number(filters.sizeMin)
    if (!Number.isNaN(n)) conds.push(gte(files.size, n))
  }
  if (filters?.sizeMax) {
    const n = Number(filters.sizeMax)
    if (!Number.isNaN(n)) conds.push(lte(files.size, n))
  }
  const where = and(...conds)

  // Whitelist of sortable columns (key → Drizzle column)
  const sortableColumns: Record<string, PgColumn> = {
    id: files.id,
    filename: files.filename,
    originalName: files.originalName,
    hash: files.hash,
    size: files.size,
    mimeType: files.mimeType,
    path: files.path,
    storage: files.storage,
    userId: files.userId,
    createdAt: files.createdAt,
    deletedAt: files.deletedAt,
  }
  const orderByClauses = []
  const sortCol = sort ? sortableColumns[sort.field] : undefined
  if (sort && sortCol) {
    orderByClauses.push(sort.order === 'desc' ? desc(sortCol) : asc(sortCol))
  }
  orderByClauses.push(desc(files.id)) // stable tiebreaker

  const rows = await db.select().from(files).where(where).orderBy(...orderByClauses).limit(limit).offset(offset)
  const [countRow] = await db.select({ value: count() }).from(files).where(where)
  return { rows, total: Number(countRow?.value ?? 0) }
}

export async function findFileById(id: number): Promise<FileRow | null> {
  const [row] = await db.select().from(files).where(eq(files.id, id)).limit(1)
  return row ?? null
}

/**
 * Dedup lookup scoped to a single user, with soft-deleted resurrection.
 * - Returns an active record with the same hash for this user.
 * - A soft-deleted record with the same hash is restored (deletedAt cleared) and returned.
 * - Returns null when no record exists for this user, so the caller creates a new one.
 */
export async function findFileByHashForDedup(hash: string, userId: number): Promise<FileRow | null> {
  const [row] = await db.select().from(files)
    .where(and(eq(files.hash, hash), eq(files.userId, userId)))
    .limit(1)
  if (!row) return null
  if (row.deletedAt) {
    // Resurrect the soft-deleted record so the re-uploaded file becomes usable again
    await restoreFiles([row.id])
    row.deletedAt = null
  }
  return row
}

export async function findFileByPath(path: string): Promise<FileRow | null> {
  const [row] = await db.select().from(files).where(eq(files.path, path)).limit(1)
  return row ?? null
}

/** Map a set of file storage paths → their original upload names (for
 *  displaying `file`-typed columns with a human-readable filename). */
export async function resolveFileNamesByPath(paths: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(paths.filter((p): p is string => typeof p === 'string' && p.length > 0))]
  if (!uniq.length) return new Map()
  const rows = await db
    .select({ path: files.path, originalName: files.originalName })
    .from(files)
    .where(inArray(files.path, uniq))
  return new Map(rows.map(r => [r.path, r.originalName]))
}

export async function createFileRecord(userId: number, input: {
  filename: string
  originalName: string
  hash: string
  mimeType?: string | null
  size?: number
  path: string
  storage?: string
}): Promise<FileRow> {
  const [row] = await db.insert(files).values({
    userId,
    filename: input.filename,
    originalName: input.originalName,
    hash: input.hash,
    mimeType: input.mimeType ?? null,
    size: input.size ?? 0,
    path: input.path,
    storage: input.storage ?? 'local'
  }).returning()
  if (!row) throw new Error('Failed to create file record')
  return row
}

export async function updateFileRecord(id: number, input: {
  filename?: string
  originalName?: string
  mimeType?: string | null
  size?: number
  path?: string
  storage?: string
}): Promise<FileRow | null> {
  const sets: Partial<typeof files.$inferInsert> = {}
  if (input.filename !== undefined) sets.filename = input.filename
  if (input.originalName !== undefined) sets.originalName = input.originalName
  if (input.mimeType !== undefined) sets.mimeType = input.mimeType
  if (input.size !== undefined) sets.size = input.size
  if (input.path !== undefined) sets.path = input.path
  if (input.storage !== undefined) sets.storage = input.storage
  if (Object.keys(sets).length === 0) {
    return await findFileById(id)
  }
  sets.updatedAt = new Date()
  const [row] = await db.update(files).set(sets).where(eq(files.id, id)).returning()
  return row ?? null
}

export async function deleteFileRecord(id: number): Promise<boolean> {
  const result = await db.delete(files).where(eq(files.id, id)).returning({ id: files.id })
  return result.length > 0
}

export async function softDeleteFiles(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db.update(files).set({ deletedAt: new Date(), updatedAt: new Date() }).where(inArray(files.id, ids)).returning({ id: files.id })
  return result.length
}

export async function restoreFiles(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db.update(files).set({ deletedAt: null, updatedAt: new Date() }).where(inArray(files.id, ids)).returning({ id: files.id })
  return result.length
}

export async function permanentDeleteFiles(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db.delete(files).where(inArray(files.id, ids)).returning({ id: files.id })
  return result.length
}

export function toPublicFile(f: FileRow) {
  return {
    id: f.id,
    userId: f.userId,
    filename: f.filename,
    originalName: f.originalName,
    hash: f.hash,
    mimeType: f.mimeType,
    size: f.size,
    path: f.path,
    storage: f.storage,
    deletedAt: f.deletedAt,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt
  }
}

export type PublicFile = ReturnType<typeof toPublicFile>
