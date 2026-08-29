import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const peerId = Number(getRouterParam(event, 'peerId'))
  if (!peerId) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid peer id' })
  const { page, pageSize, offset, limit } = parsePagination(event)
  const { rows, total } = await getMessageHistory(ctx.user.id, peerId, offset, limit)
  return { messages: rows, pagination: buildPagination(page, pageSize, total) }
})
