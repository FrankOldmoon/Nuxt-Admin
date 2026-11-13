/**
 * HTTP (non-streaming) LLM chat API with server-side tool calling.
 * Fallback for the WebSocket flow: when the browser cannot establish a ws
 * connection (cookie policy / network issues / ...), the frontend can fall
 * back to a plain POST; the caller and the config reading are identical to ws.ts.
 *
 * POST /api/llm/chat
 *  Body:
 *    {
 *      "messages": [{ "role": "user", "content": "Hello" }, ...],
 *      "model": "...",          // optional override
 *      "temperature": 0.7,      // optional override
 *      "maxTokens": 2048,       // optional override
 *      "useTools": true,        // optional; default true
 *      "sessionId": "...",      // optional execution grouping
 *      "taskId": "...",         // optional execution grouping
 *      "confirm": { "id": "...", "approved": true }  // resume a persisted approval
 *    }
 *  Response:
 *    { "content": "...", "status": "completed", "ui"?: ..., "pending"?: ... }
 *
 * Authentication: the main project's unified chain (requireUser — session cookie)
 */
import { randomUUID } from 'node:crypto'
import type { PublicUser } from '~/types/auth'
import {
  describeAgentTools,
  extractUiDirective,
  runAgentLoop,
  type AgentAuditEvent,
  type AgentLoopResult,
  type AgentMessage,
  type AgentModel,
  type AgentToolDescriptor
} from '~~/server/core/agent'
import type { ApprovalCall } from '~~/server/core/agentApproval'
import { writeAudit } from '~~/server/core/audit'
import { db } from '~~/server/database'
import { moduleTools, moduleUi, registerEnabledModuleServices } from '~~/server/utils/moduleRuntime'
import {
  createAgentApproval,
  decideAgentApproval,
  findAgentExecution,
  finishAgentExecution,
  markAgentApprovalStatus,
  recordAgentToolCall,
  startAgentExecution,
  updateAgentExecutionMetadata
} from '~~/server/utils/agentStore'
import { runLlmChatSync, runLlmChatTurn } from '~~/server/utils/llm'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  useTools?: boolean
  sessionId?: string
  taskId?: string
  agentId?: string
  confirm?: { id?: string, approved?: boolean }
}

interface SuspendedExecution {
  messages: AgentMessage[]
  tools: AgentToolDescriptor[]
  useTools: boolean
}

function toOpenAiTools(tools: AgentToolDescriptor[]) {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

function parseCallArguments(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) as unknown : {}
  } catch {
    return {}
  }
}

export default defineEventHandler(async (event) => {
  // 1. Auth: use the same requireUser (session cookie) as every business API
  const ctx = await requireUser(event)
  const user = ctx.user as unknown as PublicUser

  if (!user.isActive || (user as { deletedAt?: Date | null }).deletedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Account is disabled or deleted' })
  }

  // 2. Read the body
  let body: ChatRequest
  try {
    body = await readBody(event) as ChatRequest
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid JSON body' })
  }

  const confirming = !!body.confirm?.id
  if (!confirming) {
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw createError({ statusCode: 400, message: '"messages" array is required and must not be empty' })
    }
    for (const m of body.messages) {
      if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
        throw createError({ statusCode: 400, message: 'Each message must have { role, content } strings' })
      }
    }
  }

  const permissions = ctx.permissions ?? []
  const recordActor = {
    userId: user.id,
    tenantId: ctx.organization?.tenantId ?? null,
    organizationId: ctx.organization?.id ?? null
  }
  const actor = {
    userId: user.id,
    roleName: ctx.role?.name,
    permissions,
    organizationId: ctx.organization?.id,
    tenantId: ctx.organization?.tenantId
  }

  // 3. Tool descriptors are derived from the registry and filtered by permission.
  await registerEnabledModuleServices()
  const tools = body.useTools === false ? [] : describeAgentTools(moduleTools as never, permissions)

  let executionId = 0
  let executionClosed = false
  if (!confirming) {
    executionId = await startAgentExecution({
      ...recordActor,
      agentId: body.agentId ?? 'agent',
      sessionId: body.sessionId ?? null,
      taskId: body.taskId ?? null,
      modelId: body.model ?? null,
      metadata: { useTools: body.useTools !== false }
    })
  }

  const audit = async (entry: AgentAuditEvent) => {
    try {
      await recordAgentToolCall({
        executionId,
        moduleId: entry.moduleId ?? null,
        toolId: entry.toolId,
        callId: entry.callId,
        status: entry.outcome,
        riskLevel: entry.riskLevel ?? null,
        args: entry.args,
        resultSize: entry.resultSize ?? null,
        durationMs: entry.durationMs ?? null,
        error: entry.error ?? null
      })
    } catch {
      // Persistence must never break the conversation.
    }
    try {
      await writeAudit(db, {
        actorUserId: user.id,
        tenantId: ctx.organization?.tenantId,
        organizationId: ctx.organization?.id,
        moduleId: 'agent',
        action: `tool.${entry.outcome}`,
        resource: 'agent_tool',
        recordId: entry.callId,
        after: {
          toolId: entry.toolId,
          moduleId: entry.moduleId ?? null,
          riskLevel: entry.riskLevel ?? null,
          error: entry.error ?? null
        },
        outcome: entry.outcome === 'success' ? 'success' : 'failure',
        source: 'llm-chat'
      })
    } catch {
      // Best-effort audit.
    }
  }

  let lastModel: string | undefined = body.model
  let lastProvider: string | undefined
  const model: AgentModel = async (messages, descriptors) => {
    const turn = await runLlmChatTurn({
      messages,
      tools: toOpenAiTools(descriptors),
      model: body.model,
      temperature: body.temperature,
      maxTokens: body.maxTokens
    })
    lastModel = turn.model ?? lastModel
    lastProvider = turn.provider ?? lastProvider
    return turn
  }

  const closeExecution = async (result: AgentLoopResult, status: 'completed' | 'failed' | 'pending_approval') => {
    if (executionClosed) return
    executionClosed = true
    await finishAgentExecution(executionId, {
      status,
      usage: result.usage,
      costUsd: result.costUsd,
      error: result.status === 'failed' ? result.error : undefined,
      modelId: lastModel ?? null,
      providerId: lastProvider ?? null
    })
  }

  try {
    // 3a. Confirmation resume path (persisted approval batch).
    if (confirming) {
      const batchId = body.confirm!.id!
      const approved = body.confirm!.approved === true
      const approval = await decideAgentApproval({ batchId, approved, actor: recordActor })
      executionId = approval.executionId
      const execution = await findAgentExecution(approval.executionId)
      const suspended = (execution?.metadata as { suspend?: SuspendedExecution } | null)?.suspend
      if (!suspended) {
        throw createError({ statusCode: 409, message: 'Approval context has expired; start a new request' })
      }

      const calls = (approval.calls as unknown as ApprovalCall[]).map(call => ({
        id: call.callId,
        type: 'function' as const,
        function: { name: call.toolId, arguments: JSON.stringify(call.arguments) }
      }))
      const ids = calls.map(call => call.id)
      if (approved) await markAgentApprovalStatus(batchId, 'executing')

      let result: AgentLoopResult
      try {
        result = await runAgentLoop({
          model,
          registry: moduleTools as never,
          context: actor,
          messages: suspended.messages,
          tools: suspended.tools ?? tools,
          pendingCalls: calls,
          confirmations: {
            approved: new Set(approved ? ids : []),
            rejected: new Set(approved ? [] : ids)
          },
          audit
        })
      } catch (error) {
        if (approved) await markAgentApprovalStatus(batchId, 'failed')
        throw error
      }
      if (approved) {
        await markAgentApprovalStatus(batchId, result.status === 'failed' ? 'failed' : 'completed')
      }
      return await finalize(result)
    }

    // 3b. No registered tools → keep the original plain completion path.
    if (tools.length === 0) {
      const content = await runLlmChatSync({
        messages: body.messages,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens
      })
      executionClosed = true
      await finishAgentExecution(executionId, { status: 'completed', modelId: body.model ?? null })
      return { content, status: 'completed', toolCalls: 0 }
    }

    const result = await runAgentLoop({
      model,
      registry: moduleTools as never,
      context: actor,
      messages: body.messages.map(message => ({ role: message.role, content: message.content })),
      tools,
      audit
    })
    return await finalize(result)
  } catch (e: unknown) {
    if (executionId && !executionClosed) {
      executionClosed = true
      const message = e instanceof Error ? e.message : String(e)
      await finishAgentExecution(executionId, { status: 'failed', error: message }).catch(() => {})
    }
    if (e && typeof e === 'object' && 'statusCode' in e) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw createError({ statusCode: 502, message: msg })
  }

  async function finalize(result: AgentLoopResult) {
    if (result.status === 'failed') {
      await closeExecution(result, 'failed')
      throw createError({ statusCode: 502, message: result.error })
    }
    if (result.status === 'pending_confirmation') {
      const batchId = randomUUID()
      const calls: ApprovalCall[] = result.pending.map(call => ({
        callId: call.id,
        toolId: call.function.name,
        arguments: parseCallArguments(call.function.arguments)
      }))
      await createAgentApproval({
        batchId,
        executionId,
        ...recordActor,
        calls
      })
      await updateAgentExecutionMetadata(executionId, {
        suspend: { messages: result.messages, tools, useTools: body.useTools !== false }
      })
      await closeExecution(result, 'pending_approval')
      return {
        content: result.content,
        status: 'pending_confirmation' as const,
        toolCalls: result.toolCalls,
        pending: {
          id: batchId,
          calls: result.pending.map(call => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments
          }))
        }
      }
    }

    const extraction = extractUiDirective(result.content, moduleUi)
    await closeExecution(result, 'completed')
    return {
      // Keep a valid ```ui block so the existing client renderer keeps working;
      // invalid/unknown blocks are stripped and reported instead.
      content: extraction.ui ? result.content : extraction.content,
      status: 'completed' as const,
      toolCalls: result.toolCalls,
      ...(extraction.ui ? { ui: extraction.ui } : {}),
      ...(extraction.error ? { uiError: extraction.error } : {})
    }
  }
})
