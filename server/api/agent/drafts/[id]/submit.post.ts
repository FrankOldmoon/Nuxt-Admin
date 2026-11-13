// POST /api/agent/drafts/:id/submit — execute a chat-form draft exactly once.
import { createError, getRouterParams } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import {
  chatActorFrom,
  chatRecordActorFrom
} from '~~/server/utils/agentChatRuntime'
import { submitAgentDraft } from '~~/server/utils/agentDraftService'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const params = getRouterParams(event) as { id?: string }
  const draftId = Number(params.id)
  if (!Number.isSafeInteger(draftId) || draftId <= 0) {
    throw createError({ statusCode: 400, message: 'Invalid draft id' })
  }

  const body = await readBody<{ payload?: unknown }>(event).catch(() => ({} as { payload?: unknown }))
  if (body?.payload !== undefined && (typeof body.payload !== 'object' || body.payload === null || Array.isArray(body.payload))) {
    throw createError({ statusCode: 400, message: 'payload must be an object' })
  }

  return await submitAgentDraft({
    draftId,
    payload: body?.payload as Record<string, unknown> | undefined,
    actor: chatActorFrom(ctx),
    recordActor: chatRecordActorFrom(ctx)
  })
})
