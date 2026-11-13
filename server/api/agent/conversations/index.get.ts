// GET /api/agent/conversations — the caller's active conversations.
import { requireUser } from '~~/server/utils/auth'
import { listAgentConversations } from '~~/server/utils/agentStore'
import { chatRecordActorFrom, serializeConversation } from '~~/server/utils/agentChatRuntime'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const actor = chatRecordActorFrom(ctx)
  const rows = await listAgentConversations(actor)
  return { items: rows.map(serializeConversation) }
})
