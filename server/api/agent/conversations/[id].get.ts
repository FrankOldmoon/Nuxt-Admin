// GET /api/agent/conversations/:id — conversation detail with messages.
import { createError, getRouterParams } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { findAgentConversation, listAgentMessages } from '~~/server/utils/agentStore'
import {
  chatRecordActorFrom,
  serializeConversation,
  serializeConversationDetail
} from '~~/server/utils/agentChatRuntime'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const params = getRouterParams(event) as { id?: string }
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid conversation id' })
  }

  const actor = chatRecordActorFrom(ctx)
  const conversation = await findAgentConversation(id, actor)
  if (!conversation) throw createError({ statusCode: 404, message: 'Conversation not found' })

  const messages = await listAgentMessages(id)
  return serializeConversationDetail(serializeConversation(conversation), messages)
})
