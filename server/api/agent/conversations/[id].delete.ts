// DELETE /api/agent/conversations/:id — archive (soft delete).
import { createError, getRouterParams, setResponseStatus } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { archiveAgentConversation } from '~~/server/utils/agentStore'
import { chatRecordActorFrom } from '~~/server/utils/agentChatRuntime'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const params = getRouterParams(event) as { id?: string }
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid conversation id' })
  }

  const archived = await archiveAgentConversation(id, chatRecordActorFrom(ctx))
  if (!archived) throw createError({ statusCode: 404, message: 'Conversation not found' })
  setResponseStatus(event, 204)
  return null
})
