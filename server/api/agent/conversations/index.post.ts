// POST /api/agent/conversations — create an empty conversation ("new chat").
import { createError } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { createAgentConversation } from '~~/server/utils/agentStore'
import { chatRecordActorFrom, serializeConversation } from '~~/server/utils/agentChatRuntime'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const body = await readBody<{ title?: unknown }>(event).catch(() => ({} as { title?: unknown }))

  if (body?.title !== undefined && typeof body.title !== 'string') {
    throw createError({ statusCode: 400, message: 'title must be a string' })
  }

  const row = await createAgentConversation({
    ...chatRecordActorFrom(ctx),
    title: body?.title
  })
  return serializeConversation(row)
})
