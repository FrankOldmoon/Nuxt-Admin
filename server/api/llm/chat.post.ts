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
 *      "confirm": { "id": "...", "approved": true }  // resume a pending command
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
  type AgentMessage,
  type AgentModel,
  type AgentToolCall,
  type AgentToolDescriptor
} from '~~/server/core/agent'
import { writeAudit } from '~~/server/core/audit'
import { db } from '~~/server/database'
import { moduleTools, moduleUi, registerEnabledModuleServices } from '~~/server/utils/moduleRuntime'
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
  confirm?: { id?: string, approved?: boolean }
}

interface PendingConfirmation {
  actorUserId: number
  messages: AgentMessage[]
  calls: AgentToolCall[]
  tools: AgentToolDescriptor[]
  options: { model?: string, temperature?: number, maxTokens?: number }
  createdAt: number
}

const PENDING_TTL_MS = 10 * 60 * 1000
const pendingConfirmations = new Map<string, PendingConfirmation>()

function prunePending(): void {
  const cutoff = Date.now() - PENDING_TTL_MS
  for (const [id, record] of pendingConfirmations) {
    if (record.createdAt < cutoff) pendingConfirmations.delete(id)
  }
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

  const audit = async (entry: AgentAuditEvent) => {
    await writeAudit(db, {
      actorUserId: user.id,
      tenantId: ctx.organization?.tenantId,
      organizationId: ctx.organization?.id,
      moduleId: 'agent',
      action: `tool.${entry.outcome}`,
      resource: 'agent_tool',
      recordId: entry.callId,
      after: { toolId: entry.toolId, error: entry.error ?? null },
      outcome: entry.outcome === 'success' ? 'success' : 'failure',
      source: 'llm-chat'
    })
  }

  const model: AgentModel = async (messages, descriptors) => await runLlmChatTurn({
    messages,
    tools: toOpenAiTools(descriptors),
    model: body.model,
    temperature: body.temperature,
    maxTokens: body.maxTokens
  })

  try {
    // 3a. Confirmation resume path (in-memory pending store).
    if (confirming) {
      prunePending()
      const record = pendingConfirmations.get(body.confirm!.id!)
      if (!record || record.actorUserId !== user.id) {
        throw createError({ statusCode: 404, message: 'Pending confirmation not found or expired' })
      }
      pendingConfirmations.delete(body.confirm!.id!)
      const ids = record.calls.map(call => call.id)
      const approved = body.confirm!.approved === true
      const result = await runAgentLoop({
        model,
        registry: moduleTools as never,
        context: actor,
        messages: record.messages,
        tools: record.tools,
        pendingCalls: record.calls,
        confirmations: {
          approved: new Set(approved ? ids : []),
          rejected: new Set(approved ? [] : ids)
        },
        audit
      })
      return finalize(result, record.options)
    }

    // 3b. No registered tools → keep the original plain completion path.
    if (tools.length === 0) {
      const content = await runLlmChatSync({
        messages: body.messages,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens
      })
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
    return finalize(result, {
      model: body.model,
      temperature: body.temperature,
      maxTokens: body.maxTokens
    })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'statusCode' in e) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw createError({ statusCode: 502, message: msg })
  }

  function finalize(
    result: Awaited<ReturnType<typeof runAgentLoop>>,
    options: PendingConfirmation['options']
  ) {
    if (result.status === 'failed') {
      throw createError({ statusCode: 502, message: result.error })
    }
    if (result.status === 'pending_confirmation') {
      const id = randomUUID()
      pendingConfirmations.set(id, {
        actorUserId: user.id,
        messages: result.messages,
        calls: result.pending,
        tools,
        options,
        createdAt: Date.now()
      })
      return {
        content: result.content,
        status: 'pending_confirmation' as const,
        toolCalls: result.toolCalls,
        pending: {
          id,
          calls: result.pending.map(call => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments
          }))
        }
      }
    }

    const extraction = extractUiDirective(result.content, moduleUi)
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
