import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid notification id' })
  const deleted = await deleteNotification(id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Notification not found' })
  return { success: true }
})
