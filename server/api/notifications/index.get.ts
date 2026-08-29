export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const { page, pageSize, offset, limit } = parsePagination(event)
  const { rows, total } = await listNotificationsPaged(ctx.user.id, offset, limit)
  return { notifications: rows, pagination: buildPagination(page, pageSize, total) }
})
