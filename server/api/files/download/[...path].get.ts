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

  setResponseHeader(event, 'Content-Type', file.mimeType || 'application/octet-stream')
  setResponseHeader(event, 'Content-Disposition', formatContentDisposition('attachment', file.originalName))
  setResponseHeader(event, 'Content-Length', await getFileSize(file.path))

  return sendStream(event, createStorageStream(file.path))
})
