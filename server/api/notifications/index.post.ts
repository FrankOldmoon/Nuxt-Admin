import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const ctx = await requireAdmin(event)
  const body = await readBody<{ title?: string, content?: string, targetUserIds?: number[] | null }>(event)
  if (!body?.title?.trim() || !body?.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Title and content are required' })
  }
  const notification = await createNotification({
    title: body.title.trim(),
    content: body.content.trim(),
    createdBy: ctx.user.id,
    targetUserIds: body.targetUserIds ?? null
  })
  return { notification }
})
