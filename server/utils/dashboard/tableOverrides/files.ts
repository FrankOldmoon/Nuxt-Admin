// Files table — full-table CRUD takeover (incl. custom upload endpoint).
//
// Registered as a `TableCrudHandler` (see server/utils/dashboard/tableOverrides.ts)
// so `/api/dashboard/data/files/*` dispatch here instead of the generic CRUD.
// Keeps ownership checks, multipart upload, dedup, and storage writes together.

import { createError, getQuery, getRouterParam, readBody, readMultipartFormData } from 'h3'
import type { H3Event } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import { db } from '~~/server/utils/db'
import { users, files as filesTable } from '~~/server/database/schema'
import { requireAdmin, isAdmin } from '~~/server/utils/auth'
import { parsePagination, buildPagination } from '~~/server/utils/pagination'
import { getConfigValue } from '~~/server/utils/configs'
import { calculateHash, buildStoragePath, saveToStorage } from '~~/server/utils/fileStorage'
import {
  listFilesPaged, findFileById, updateFileRecord, softDeleteFiles,
  restoreFiles, permanentDeleteFiles, createFileRecord, findFileByHashForDedup, toPublicFile,
} from '~~/server/utils/files'
import type { FileFilters } from '~~/server/utils/files'
import type { TableCrudHandler } from '../tableOverrides'

function parseAllowedMimeTypes(raw: string): string[] | null {
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return list.length === 0 ? null : list
}

const handler: TableCrudHandler = {
  table: 'files',

  async list(event: H3Event) {
    const ctx = await requireAdmin(event)
    const admin = isAdmin(ctx)
    const { page, pageSize, offset, limit } = parsePagination(event)
    const q = getQuery(event)
    const trashed = q.trashed === 'true'
    const filters: FileFilters = {}
    if (typeof q.search === 'string' && q.search) filters.search = q.search
    if (typeof q.mimeType === 'string' && q.mimeType) filters.mimeType = q.mimeType
    if (typeof q.sizeMin === 'string' && q.sizeMin) filters.sizeMin = q.sizeMin
    if (typeof q.sizeMax === 'string' && q.sizeMax) filters.sizeMax = q.sizeMax
    const sort = (typeof q.sort === 'string' && q.sort)
      ? { field: q.sort, order: q.order === 'desc' ? 'desc' as const : 'asc' as const }
      : undefined
    const { rows, total } = await listFilesPaged(ctx.user.id, admin, offset, limit, trashed, filters, sort)

    const userIds = [...new Set(rows.map(r => r.userId))]
    let userMap = new Map<number, string>()
    if (userIds.length > 0) {
      const userRows = await db.select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds))
      userMap = new Map(userRows.map(u => [u.id, u.username]))
    }
    const items = rows.map(r => ({ ...toPublicFile(r), userName: userMap.get(r.userId) ?? String(r.userId) }))
    return { items, pagination: buildPagination(page, pageSize, total) }
  },

  async getOne(event: H3Event) {
    const ctx = await requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid file id' })
    const file = await findFileById(id)
    if (!file) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'File not found' })
    if (!isAdmin(ctx) && file.userId !== ctx.user.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Not allowed to access this file' })
    }
    const [userRow] = await db.select({ username: users.username })
      .from(users)
      .where(eq(users.id, file.userId))
      .limit(1)
    return { item: { ...toPublicFile(file), userName: userRow?.username ?? String(file.userId) } }
  },

  async update(event: H3Event) {
    const ctx = await requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid file id' })
    const existing = await findFileById(id)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'File not found' })
    if (!isAdmin(ctx) && existing.userId !== ctx.user.id) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Not allowed to edit this file' })
    }
    const body = await readBody<{
      filename?: string
      originalName?: string
      mimeType?: string | null
      size?: number
      path?: string
      storage?: string
    }>(event)
    const updated = await updateFileRecord(id, {
      filename: body.filename?.trim() || undefined,
      originalName: body.originalName?.trim() || undefined,
      mimeType: body.mimeType,
      size: body.size,
      path: body.path?.trim() || undefined,
      storage: body.storage,
    })
    return { item: updated ? toPublicFile(updated) : null }
  },

  async batch(event: H3Event) {
    const ctx = await requireAdmin(event)
    const body = await readBody<{ action?: string, ids?: number[] }>(event)
    const action = body?.action
    const ids = Array.isArray(body?.ids) ? body.ids : []
    if (ids.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'ids array is required' })
    }
    // Non-admin: verify every target id belongs to the actor before acting.
    if (!isAdmin(ctx)) {
      const targets = await db.select({ id: filesTable.id, userId: filesTable.userId })
        .from(filesTable)
        .where(inArray(filesTable.id, ids))
      const owned = new Set(targets.filter(f => f.userId === ctx.user.id).map(f => f.id))
      for (const id of ids) {
        if (!owned.has(id)) {
          throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Not allowed to operate on this file' })
        }
      }
    }
    switch (action) {
      case 'soft-delete':
        return { ok: true, action, affected: await softDeleteFiles(ids) }
      case 'restore':
        return { ok: true, action, affected: await restoreFiles(ids) }
      case 'permanent-delete':
        return { ok: true, action, affected: await permanentDeleteFiles(ids) }
      default:
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid action. Use: soft-delete, restore, or permanent-delete' })
    }
  },

  async upload(event: H3Event) {
    const ctx = await requireAdmin(event)
    const formData = await readMultipartFormData(event)
    if (!formData) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No files uploaded' })
    }
    const fileParts = formData.filter(p => p.name === 'files' && p.filename)
    if (fileParts.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No files found in request' })
    }
    const maxFileSizeMB = await getConfigValue<number>('upload.maxFileSize', 10)
    const maxFileSizeBytes = Math.max(0, maxFileSizeMB) * 1024 * 1024
    const allowedMimes = parseAllowedMimeTypes(await getConfigValue<string>('upload.allowedMimeTypes', ''))

    const results = []
    for (const part of fileParts) {
      const buffer = part.data
      const originalName = part.filename!
      if (maxFileSizeBytes > 0 && buffer.length > maxFileSizeBytes) {
        throw createError({ statusCode: 413, statusMessage: 'Payload Too Large', message: `File "${originalName}" exceeds the max size of ${maxFileSizeMB} MB` })
      }
      const partMime = (part.type || '').toLowerCase()
      if (allowedMimes && partMime && !allowedMimes.includes(partMime)) {
        throw createError({ statusCode: 415, statusMessage: 'Unsupported Media Type', message: `File type "${partMime}" is not allowed` })
      }
      const hash = calculateHash(buffer)
      const existing = await findFileByHashForDedup(hash, ctx.user.id)
      if (existing) {
        results.push({ ...toPublicFile(existing), duplicated: true })
        continue
      }
      const storagePath = await buildStoragePath(originalName, hash)
      await saveToStorage(buffer, storagePath)
      const record = await createFileRecord(ctx.user.id, {
        filename: storagePath.split('/').pop()!,
        originalName,
        hash,
        mimeType: part.type || null,
        size: buffer.length,
        path: storagePath,
        storage: 'local',
      })
      results.push({ ...toPublicFile(record), duplicated: false })
    }
    return { files: results }
  }
}

export default handler