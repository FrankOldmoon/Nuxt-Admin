import { createError } from 'h3'

function parseAllowedMimeTypes(raw: string): string[] | null {
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return list.length === 0 ? null : list
}

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  await enforceRateLimit(event, {
    keyPrefix: 'file-upload',
    max: 30,
    windowMs: 60 * 1000,
    identifier: String(ctx.user.id)
  })

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No files uploaded' })
  }

  const fileParts = formData.filter(p => p.name === 'files' && p.filename)
  if (fileParts.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No files found in request' })
  }

  const visibilityPart = formData.find(p => p.name === 'visibility' && !p.filename)
  const visibilityRaw = visibilityPart ? visibilityPart.data.toString('utf8').trim() : 'private'
  if (visibilityRaw !== 'public' && visibilityRaw !== 'private') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'visibility must be "public" or "private"' })
  }
  const visibility = visibilityRaw as 'public' | 'private'
  const organizationId = ctx.organization?.id ?? null
  const tenantId = ctx.organization?.tenantId ?? null

  // Load upload limits from config
  const maxFileSizeMB = await getConfigValue<number>('upload.maxFileSize', 10)
  const maxFileSizeBytes = Math.max(0, maxFileSizeMB) * 1024 * 1024
  const allowedMimes = parseAllowedMimeTypes(await getConfigValue<string>('upload.allowedMimeTypes', ''))

  const results = []
  for (const part of fileParts) {
    const buffer = part.data
    const originalName = part.filename!

    // 0. Enforce size limit
    if (maxFileSizeBytes > 0 && buffer.length > maxFileSizeBytes) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Payload Too Large',
        message: `File "${originalName}" exceeds the max size of ${maxFileSizeMB} MB`
      })
    }

    // 0b. Enforce MIME allow-list
    const partMime = (part.type || '').toLowerCase()
    if (allowedMimes && partMime && !allowedMimes.includes(partMime)) {
      throw createError({
        statusCode: 415,
        statusMessage: 'Unsupported Media Type',
        message: `File type "${partMime}" is not allowed`
      })
    }

    // 1. Calculate hash and check for existing file (dedup, scoped to user, with soft-delete resurrection)
    const hash = calculateHash(buffer)
    const existing = await findFileByHashForDedup(hash, ctx.user.id)
    if (existing) {
      // The owner may intentionally change visibility by re-uploading (legacy
      // public files included). Never do this implicitly for other users.
      if (existing.visibility !== visibility) {
        const updated = await updateFileRecord(existing.id, { visibility })
        results.push({ ...toPublicFile(updated ?? { ...existing, visibility }), duplicated: true })
      } else {
        results.push({ ...toPublicFile(existing), duplicated: true })
      }
      continue
    }

    // 2. Build storage path: [dayNumber]/[contentHash].[ext]
    const storagePath = await buildStoragePath(originalName, hash)

    // 3. Save file to disk
    await saveToStorage(buffer, storagePath)

    // 4. Create database record
    const record = await createFileRecord(ctx.user.id, {
      filename: storagePath.split('/').pop()!,
      originalName,
      hash,
      mimeType: part.type || null,
      size: buffer.length,
      path: storagePath,
      storage: 'local',
      visibility,
      organizationId,
      tenantId
    })

    results.push({ ...toPublicFile(record), duplicated: false })
  }

  return { files: results }
})
