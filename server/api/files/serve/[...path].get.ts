import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const rawPath = getRouterParam(event, 'path')
  if (!rawPath) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'File path is required' })
  }

  const file = await findFileByPath(rawPath)
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'File not found' })
  }

  const mimeType = file.mimeType || 'application/octet-stream'
  const disposition = isPreviewable(file.mimeType)
    ? formatContentDisposition('inline', file.originalName)
    : formatContentDisposition('attachment', file.originalName)

  setResponseHeader(event, 'Content-Type', mimeType)
  setResponseHeader(event, 'Content-Disposition', disposition)
  setResponseHeader(event, 'Content-Length', await getFileSize(file.path))

  return sendStream(event, createStorageStream(file.path))
})
