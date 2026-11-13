/**
 * Draft submission — the only path that executes a chat-form write.
 *
 * Security/consistency rules:
 * - the draft must belong to the caller and the same conversation/org,
 * - capability visibility is re-checked with current permissions,
 * - `draft -> submitted` is claimed atomically (single execution, idempotent),
 * - the registered tool runs through `ToolRegistry.run` (schema + authorize +
 *   timeout + output limit), so Services remain the only data-access path.
 */
import { createError } from 'h3'
import {
  assertCapabilityInput,
  getCapability
} from '../core/capability'
import type { ChatResponse, ToolCallCard } from '../core/conversation'
import { moduleTools } from './moduleRuntime'
import {
  addAgentMessage,
  attachDraftExecution,
  claimAgentDraftForSubmit,
  findAgentConversation,
  findAgentDraft,
  finishAgentExecution,
  recordAgentToolCall,
  restoreAgentDraft,
  startAgentExecution
} from './agentStore'
import {
  isCapabilityVisible,
  persistDirectResult,
  summarizeCapabilityResult,
  type ChatActor,
  type ChatRecordActor
} from './agentChatRuntime'

export interface SubmitDraftInput {
  draftId: number
  payload?: Record<string, unknown>
  actor: ChatActor
  recordActor: ChatRecordActor
}

function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode
    if (typeof statusCode === 'number' && statusCode >= 400) return statusCode
  }
  return 400
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function submitAgentDraft(input: SubmitDraftInput): Promise<ChatResponse> {
  const draft = await findAgentDraft(input.draftId)
  if (!draft || draft.userId !== input.actor.userId) {
    throw createError({ statusCode: 404, message: 'Draft not found' })
  }
  const conversation = await findAgentConversation(draft.conversationId, input.recordActor)
  if (!conversation) throw createError({ statusCode: 404, message: 'Draft not found' })
  if (draft.status === 'submitted') {
    throw createError({ statusCode: 409, message: 'Draft has already been submitted' })
  }
  if (draft.status !== 'draft') {
    throw createError({ statusCode: 409, message: `Draft is ${draft.status}` })
  }

  const capability = getCapability(draft.capabilityId)
  if (!capability) throw createError({ statusCode: 409, message: 'Capability is no longer available' })
  if (!isCapabilityVisible(capability, input.actor)) {
    throw createError({ statusCode: 403, message: 'No permission to execute this capability' })
  }

  const payload = input.payload ?? (draft.payload as Record<string, unknown>)
  try {
    assertCapabilityInput(capability, payload)
  } catch (error) {
    throw createError({ statusCode: 400, message: errorMessage(error) })
  }

  // Preview re-validates cross-organization relations before the draft locks.
  try {
    await capability.preview?.(payload, input.actor)
  } catch (error) {
    throw createError({ statusCode: errorStatus(error), message: errorMessage(error) })
  }

  const claimed = await claimAgentDraftForSubmit(draft.id, input.recordActor)
  if (!claimed) throw createError({ statusCode: 409, message: 'Draft has already been submitted' })

  const executionId = await startAgentExecution({
    ...input.recordActor,
    agentId: 'sms-chat',
    sessionId: String(draft.conversationId),
    metadata: { conversationId: draft.conversationId, draftId: draft.id, capabilityId: capability.id }
  })

  await addAgentMessage({
    conversationId: draft.conversationId,
    role: 'user',
    content: `提交表单：${capability.title}`,
    executionId
  })

  const callId = `draft-${draft.id}`
  try {
    const result = await moduleTools.run(capability.id, payload, input.actor)
    const summary = summarizeCapabilityResult(capability, result)

    await recordAgentToolCall({
      executionId,
      moduleId: capability.moduleId,
      toolId: capability.id,
      callId,
      status: 'success',
      riskLevel: capability.riskLevel,
      args: payload,
      resultSize: JSON.stringify(result ?? null)?.length ?? null
    })
    await finishAgentExecution(executionId, { status: 'completed' })
    await attachDraftExecution(draft.id, executionId)

    const cards: ToolCallCard[] = [{
      id: callId,
      name: capability.id,
      title: capability.title,
      status: 'success',
      summary,
      arguments: payload
    }]

    return await persistDirectResult({
      conversationId: draft.conversationId,
      executionId,
      content: `已完成：${summary}`,
      summary,
      capabilityId: capability.id,
      capabilityTitle: capability.title,
      toolCalls: cards
    })
  } catch (error) {
    const message = errorMessage(error)
    await recordAgentToolCall({
      executionId,
      moduleId: capability.moduleId,
      toolId: capability.id,
      callId,
      status: 'failure',
      riskLevel: capability.riskLevel,
      args: payload,
      error: message
    }).catch(() => {})
    await finishAgentExecution(executionId, { status: 'failed', error: message }).catch(() => {})
    // Nothing was written by the service (it throws before committing), so the
    // draft can be retried.
    await restoreAgentDraft(draft.id)

    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 400, message })
  }
}
