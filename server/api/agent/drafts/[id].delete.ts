// DELETE /api/agent/drafts/:id — cancel an open chat-form draft.
import { createError, getRouterParams, setResponseStatus } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { cancelAgentDraft } from '~~/server/utils/agentStore'
import { chatRecordActorFrom } from '~~/server/utils/agentChatRuntime'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const params = getRouterParams(event) as { id?: string }
  const draftId = Number(params.id)
  if (!Number.isSafeInteger(draftId) || draftId <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid draft id' })
  }

  const cancelled = await cancelAgentDraft(draftId, chatRecordActorFrom(ctx))
  if (!cancelled) throw createError({ statusCode: 404, message: 'Draft not found or already submitted' })
  setResponseStatus(event, 204)
  return null
})
