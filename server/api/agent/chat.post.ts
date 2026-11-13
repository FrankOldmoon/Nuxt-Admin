/**
 * POST /api/agent/chat — server-side tool loop for the chat workbench.
 *
 * Body:
 *   {
 *     conversationId?: number,
 *     message?: string,
 *     draftId?: number,          // submit a chat-form draft instead of chatting
 *     confirmations?: { approved?: string[], rejected?: string[] },
 *     agentId?: string,
 *     model?, temperature?, maxTokens?
 *   }
 *
 * The model only sees capabilities permitted by the caller's server-resolved
 * permissions. Commands never execute from this endpoint: they return a form
 * draft or an approval batch.
 */
import { createError } from 'h3'
import type { AgentMessage } from '~~/server/core/agent'
import { conversationTitleFrom } from '~~/server/core/conversation'
import { requireUser } from '~~/server/utils/auth'
import {
  addAgentMessage,
  createAgentConversation,
  findAgentConversation,
  finishAgentExecution,
  listAgentMessages,
  startAgentExecution
} from '~~/server/utils/agentStore'
import {
  chatActorFrom,
  chatRecordActorFrom,
  chatSystemMessage,
  chatTools,
  createChatModel,
  finalizeChatResult,
  runChatLoop
} from '~~/server/utils/agentChatRuntime'
import { submitAgentDraft } from '~~/server/utils/agentDraftService'
import { registerEnabledModuleServices } from '~~/server/utils/moduleRuntime'
import { runLlmChatSync } from '~~/server/utils/llm'

interface ChatBody {
  conversationId?: number
  message?: string
  draftId?: number
  agentId?: string
  model?: string
  temperature?: number
  maxTokens?: number
  confirmations?: { approved?: string[], rejected?: string[] }
}

function positiveId(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: `${field} must be a positive integer` })
  }
  return id
}

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  await enforceRateLimit(event, {
    keyPrefix: 'agent-chat',
    max: 30,
    windowMs: 60 * 1000,
    identifier: String(ctx.user.id)
  })
  const body = await readBody<ChatBody>(event).catch(() => {
    throw createError({ statusCode: 400, message: 'Invalid JSON body' })
  })

  const conversationIdInput = positiveId(body?.conversationId, 'conversationId')
  const draftId = positiveId(body?.draftId, 'draftId')
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message && !draftId) {
    throw createError({ statusCode: 400, message: '"message" or "draftId" is required' })
  }
  if (message.length > 4000) {
    throw createError({ statusCode: 400, message: 'message is too long (max 4000 characters)' })
  }

  await registerEnabledModuleServices()

  const actor = chatActorFrom(ctx)
  const recordActor = chatRecordActorFrom(ctx)

  // Draft submission is a direct, deterministic execution — no extra model turn.
  if (draftId) {
    return await submitAgentDraft({ draftId, actor, recordActor })
  }

  let conversation
  if (conversationIdInput) {
    conversation = await findAgentConversation(conversationIdInput, recordActor)
    if (!conversation) throw createError({ statusCode: 404, message: 'Conversation not found' })
  } else {
    conversation = await createAgentConversation({
      ...recordActor,
      title: conversationTitleFrom(message)
    })
  }
  const conversationId = conversation.id

  await addAgentMessage({ conversationId, role: 'user', content: message })

  const history = await listAgentMessages(conversationId, 60)
  const messages: AgentMessage[] = [
    chatSystemMessage(actor),
    ...history
      .filter(row => row.role !== 'system' && row.content.trim().length > 0)
      .map(row => ({ role: row.role as 'user' | 'assistant', content: row.content }))
  ]

  const tools = chatTools(actor)
  const executionId = await startAgentExecution({
    ...recordActor,
    agentId: body?.agentId ?? 'sms-chat',
    sessionId: String(conversationId),
    modelId: body?.model ?? null,
    metadata: { conversationId }
  })

  // No capability visible to this caller → plain completion (still persisted).
  if (tools.length === 0) {
    const content = await runLlmChatSync({
      messages: messages.map(item => ({
        role: item.role as 'system' | 'user' | 'assistant',
        content: item.content
      })),
      model: body?.model,
      temperature: body?.temperature,
      maxTokens: body?.maxTokens
    })
    await addAgentMessage({ conversationId, role: 'assistant', content, executionId })
    await finishAgentExecution(executionId, { status: 'completed', modelId: body?.model ?? null })
    return {
      conversationId,
      status: 'completed' as const,
      message: { role: 'assistant' as const, content },
      toolCalls: []
    }
  }

  const { model, modelInfo } = createChatModel({
    model: body?.model,
    temperature: body?.temperature,
    maxTokens: body?.maxTokens
  })
  const approved = new Set(body?.confirmations?.approved ?? [])
  const rejected = new Set(body?.confirmations?.rejected ?? [])

  const result = await runChatLoop({
    actor,
    recordActor,
    messages,
    tools,
    executionId,
    model,
    confirmations: approved.size || rejected.size ? { approved, rejected } : undefined,
    source: 'agent-chat'
  })

  return await finalizeChatResult({
    result,
    conversationId,
    executionId,
    actor,
    recordActor,
    tools,
    modelInfo: modelInfo()
  })
})
