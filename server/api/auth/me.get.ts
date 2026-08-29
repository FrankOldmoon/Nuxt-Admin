import { createError } from 'h3'

export default defineEventHandler(async (event) => {
  const ctx = await getSessionUser(event)
  if (!ctx) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Not authenticated' })
  }
  return { user: toPublicUser(ctx.user, ctx.role) }
})
