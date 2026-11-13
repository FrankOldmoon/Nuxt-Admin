/**
 * POST /api/agent/approvals/:batchId — approve or reject a high-risk batch.
 *
 * The suspended loop (messages + tools) is stored in the execution metadata;
 * resuming re-authorizes every call through the registry, so a changed role or
 * organization cannot replay an old approval.
 */
import { createError, getRouterParams } from 'h3'
import type { AgentMessage, AgentToolDescriptor } from '~~/server/core/agent'
import type { ApprovalCall } from '~~/server/core/agentApproval'
import { requireUser } from '~~/server/utils/auth'
import {
  decideAgentApproval,
  findAgentExecution,
  findAgentConversation,
  markAgentApprovalStatus
} from '~~/server/utils/agentStore'
import {
  chatActorFrom,
  chatRecordActorFrom,
  createChatModel,
  finalizeChatResult,
  runChatLoop
} from '~~/server/utils/agentChatRuntime'

interface SuspendContext {
  messages: AgentMessage[]
  tools: AgentToolDescriptor[]
  conversationId: number
}

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  await enforceRateLimit(event, {
    keyPrefix: 'agent-approval',
    max: 20,
    windowMs: 60 * 1000,
    identifier: String(ctx.user.id)
  })
  const params = getRouterParams(event) as { batchId?: string }
  const batchId = params.batchId?.trim()
  if (!batchId) throw createError({ statusCode: 400, message: 'batchId is required' })

  const body = await readBody<{ decision?: unknown }>(event).catch(() => ({} as { decision?: unknown }))
  if (body?.decision !== 'approve' && body?.decision !== 'reject') {
    throw createError({ statusCode: 400, message: 'decision must be "approve" or "reject"' })
  }

  const actor = chatActorFrom(ctx)
  const recordActor = chatRecordActorFrom(ctx)
  const approved = body.decision === 'approve'

  const approval = await decideAgentApproval({ batchId, approved, actor: recordActor })
  const execution = await findAgentExecution(approval.executionId)
  const suspend = (execution?.metadata as { suspend?: SuspendContext } | null)?.suspend
  if (!suspend?.conversationId || !Array.isArray(suspend.messages)) {
    throw createError({ statusCode: 409, message: 'Approval context has expired; start a new request' })
  }

  const conversation = await findAgentConversation(suspend.conversationId, recordActor)
  if (!conversation) throw createError({ statusCode: 404, message: 'Conversation not found' })

  if (approved) await markAgentApprovalStatus(batchId, 'executing')

  const calls = (approval.calls as unknown as ApprovalCall[]).map(call => ({
    id: call.callId,
    type: 'function' as const,
    function: { name: call.toolId, arguments: JSON.stringify(call.arguments ?? {}) }
  }))
  const ids = calls.map(call => call.id)

  const { model, modelInfo } = createChatModel({})
  let result
  try {
    result = await runChatLoop({
      actor,
      recordActor,
      messages: suspend.messages,
      tools: suspend.tools,
      executionId: approval.executionId,
      model,
      pendingCalls: calls,
      confirmations: {
        approved: new Set(approved ? ids : []),
        rejected: new Set(approved ? [] : ids)
      },
      source: 'agent-approval'
    })
  } catch (error) {
    if (approved) await markAgentApprovalStatus(batchId, 'failed').catch(() => {})
    throw error
  }

  if (approved) {
    await markAgentApprovalStatus(batchId, result.status === 'failed' ? 'failed' : 'completed')
      .catch(() => {})
  }

  return await finalizeChatResult({
    result,
    conversationId: suspend.conversationId,
    executionId: approval.executionId,
    actor,
    recordActor,
    tools: suspend.tools,
    modelInfo: modelInfo()
  })
})
