// PUT /api/agent/conversations/:id — rename.
import { createError, getRouterParams } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { renameAgentConversation } from '~~/server/utils/agentStore'
import { chatRecordActorFrom, serializeConversation } from '~~/server/utils/agentChatRuntime'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const params = getRouterParams(event) as { id?: string }
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid conversation id' })
  }

  const body = await readBody<{ title?: unknown }>(event).catch(() => ({} as { title?: unknown }))
  if (typeof body?.title !== 'string') {
    throw createError({ statusCode: 400, message: 'title is required' })
  }

  const row = await renameAgentConversation(id, chatRecordActorFrom(ctx), body.title)
  if (!row) throw createError({ statusCode: 404, message: 'Conversation not found' })
  return serializeConversation(row)
})
