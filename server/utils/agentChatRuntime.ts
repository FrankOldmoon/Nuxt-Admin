/**
 * Shared runtime for the chat workbench APIs (`/api/agent/chat`, approvals,
 * draft submit). Keeps the model loop, capability filtering, persistence and
 * the form/approval materialization in one place so every entry point behaves
 * identically.
 */
import { randomUUID } from 'node:crypto'
import type { AuthContext } from '../core/authContext'
import {
  runAgentLoop,
  type AgentAuditEvent,
  type AgentLoopResult,
  type AgentMessage,
  type AgentModel,
  type AgentToolCall,
  type AgentToolDescriptor
} from '../core/agent'
import type { ApprovalCall } from '../core/agentApproval'
import type { Database } from '../database'
import {
  buildCapabilityResultTable,
  buildChatSystemPrompt,
  describeCapabilities,
  getCapability,
  mergeFormOptions,
  resolveCapabilityForm,
  type CapabilityDefinition
} from '../core/capability'
import type {
  ChatApprovalCall,
  ChatApprovalUi,
  ChatFormUi,
  ChatResponse,
  ChatStatus,
  ChatUi,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  StoredMessage,
  ToolCallCard
} from '../core/conversation'
import { asChatUi, asToolCallCards } from '../core/conversation'
import { buildComponentPrompt, extractComponentBlock } from '../core/componentBlock'
import type { agentConversations, agentMessages } from '../database/schema'
import { writeAudit } from '../core/audit'
import { db } from '../database'
import { moduleTools, moduleUi } from './moduleRuntime'
import {
  addAgentMessage,
  createAgentApproval,
  createAgentDraft,
  finishAgentExecution,
  recordAgentToolCall,
  updateAgentExecutionMetadata
} from './agentStore'
import { runLlmChatTurn } from './llm'

export interface ChatActor {
  userId: number
  roleName?: string | null
  permissions: string[]
  organizationId?: number | null
  tenantId?: number | null
}

export interface ChatRecordActor {
  userId: number
  tenantId: number | null
  organizationId: number | null
}

export function chatActorFrom(ctx: AuthContext): ChatActor {
  return {
    userId: ctx.user.id,
    roleName: ctx.role?.name ?? null,
    permissions: ctx.permissions ?? [],
    organizationId: ctx.organization?.id ?? null,
    tenantId: ctx.organization?.tenantId ?? null
  }
}

export function chatRecordActorFrom(ctx: AuthContext): ChatRecordActor {
  return {
    userId: ctx.user.id,
    tenantId: ctx.organization?.tenantId ?? null,
    organizationId: ctx.organization?.id ?? null
  }
}

type ConversationRow = typeof agentConversations.$inferSelect
type MessageRow = typeof agentMessages.$inferSelect

export function serializeConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ConversationStatus,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  }
}

export function serializeMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role as StoredMessage['role'],
    content: row.content,
    toolCalls: asToolCallCards(row.toolCalls),
    ui: asChatUi(row.ui),
    executionId: row.executionId,
    createdAt: new Date(row.createdAt).toISOString()
  }
}

export function serializeConversationDetail(
  conversation: ConversationSummary,
  messages: MessageRow[]
): ConversationDetail {
  return { ...conversation, messages: messages.map(serializeMessage) }
}

/** Permitted capabilities as model tools (permission filter server-side). */
export function chatTools(actor: ChatActor): AgentToolDescriptor[] {
  return describeCapabilities(actor.permissions)
}

export function toOpenAiTools(tools: AgentToolDescriptor[]) {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

export interface ChatModelOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

/** Model adapter that remembers the last concrete model/provider for records. */
export function createChatModel(options: ChatModelOptions) {
  let modelId: string | null = options.model ?? null
  let providerId: string | null = null
  const model: AgentModel = async (messages, descriptors) => {
    const turn = await runLlmChatTurn({
      messages,
      tools: toOpenAiTools(descriptors),
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    })
    modelId = turn.model ?? modelId
    providerId = turn.provider ?? providerId
    return turn
  }
  return {
    model,
    modelInfo: () => ({ modelId, providerId })
  }
}

/** System prompt for a chat turn (base safety + module prompts + components). */
export function chatSystemMessage(actor: ChatActor): AgentMessage {
  const components = moduleUi.list().map(component => ({ id: component.id, label: component.label }))
  const componentSection = buildComponentPrompt(components)
  const content = componentSection
    ? `${buildChatSystemPrompt(actor)}\n\n${componentSection}`
    : buildChatSystemPrompt(actor)
  return { role: 'system', content }
}

export function isCapabilityVisible(capability: CapabilityDefinition | undefined, actor: ChatActor): boolean {
  if (!capability?.permission) return !!capability
  return describeCapabilities(actor.permissions).some(tool => tool.name === capability.id)
}

function parseJson(value: string | undefined): unknown {
  if (!value || !value.trim()) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function errorOf(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const error = (value as { error?: unknown }).error
  return typeof error === 'string' ? error : undefined
}

export function summarizeCapabilityResult(capability: CapabilityDefinition | undefined, value: unknown): string {
  if (capability?.summarize) {
    try {
      return capability.summarize(value)
    } catch {
      // fall through to the generic summary
    }
  }
  if (Array.isArray(value)) return `返回 ${value.length} 条记录`
  if (value && typeof value === 'object') return capability ? `${capability.title} 已完成` : '已执行'
  return String(value ?? '')
}

/** Build human-facing tool cards from the loop transcript (no raw JSON). */
export function collectToolCards(messages: AgentMessage[]): ToolCallCard[] {
  const cards: ToolCallCard[] = []
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue
    for (const call of message.tool_calls) {
      const toolMessage = messages.find(item => item.role === 'tool' && item.tool_call_id === call.id)
      if (!toolMessage) continue
      const capability = getCapability(call.function.name)
      const payload = parseJson(toolMessage.content)
      const error = errorOf(payload)
      cards.push({
        id: call.id,
        name: call.function.name,
        title: capability?.title ?? call.function.name,
        status: error ? 'failure' : 'success',
        summary: error ?? summarizeCapabilityResult(capability, payload),
        arguments: parseJson(call.function.arguments) ?? undefined,
        error,
        // Read capabilities declare their own fixed table; the model cannot
        // invent columns or extra fields.
        ...(!error ? { table: buildCapabilityResultTable(capability, payload) } : {})
      })
    }
  }
  return cards
}

export interface FinalizeChatOptions {
  result: AgentLoopResult
  conversationId: number
  executionId: number
  actor: ChatActor
  recordActor: ChatRecordActor
  tools: AgentToolDescriptor[]
  modelInfo: { modelId: string | null, providerId: string | null }
}

/**
 * Persist a loop result and translate it to the chat wire format.
 *
 * Commands with a form become `pending_form` + a draft (never executed here).
 * High-risk commands without a form become a persisted approval batch.
 */
export async function finalizeChatResult(options: FinalizeChatOptions): Promise<ChatResponse> {
  const { result, conversationId, executionId, actor, recordActor, tools, modelInfo } = options
  const toolCalls = collectToolCards(result.messages)

  if (result.status === 'failed') {
    const content = `处理失败：${result.error}`
    await addAgentMessage({ conversationId, role: 'assistant', content, toolCalls, executionId })
    await finishAgentExecution(executionId, {
      status: 'failed',
      usage: result.usage,
      costUsd: result.costUsd,
      error: result.error,
      modelId: modelInfo.modelId,
      providerId: modelInfo.providerId
    })
    return {
      conversationId,
      status: 'failed',
      message: { role: 'assistant', content },
      toolCalls,
      error: result.error
    }
  }

  if (result.status === 'completed') {
    // A trailing ```component block may reference a registered component; it is
    // validated (id/version/props schema) and persisted as message UI.
    const extraction = extractComponentBlock(result.content, moduleUi)
    const content = extraction.content.trim() || '已完成。'
    const componentUi: ChatUi | undefined = extraction.directive
      ? { kind: 'component', ...extraction.directive }
      : undefined

    await addAgentMessage({
      conversationId,
      role: 'assistant',
      content,
      toolCalls,
      ui: componentUi,
      executionId
    })
    await finishAgentExecution(executionId, {
      status: 'completed',
      usage: result.usage,
      costUsd: result.costUsd,
      modelId: modelInfo.modelId,
      providerId: modelInfo.providerId
    })
    return {
      conversationId,
      status: 'completed',
      message: { role: 'assistant', content },
      toolCalls,
      ...(componentUi ? { ui: componentUi } : {})
    }
  }

  // pending_confirmation
  const formResponse = await materializeForm({
    pending: result.pending,
    conversationId,
    executionId,
    actor,
    recordActor,
    toolCalls
  })
  if (formResponse) return formResponse

  const batchId = randomUUID()
  const calls: ApprovalCall[] = result.pending.map(call => ({
    callId: call.id,
    toolId: call.function.name,
    arguments: parseJson(call.function.arguments) ?? {}
  }))
  await createAgentApproval({ batchId, executionId, ...recordActor, calls })
  await updateAgentExecutionMetadata(executionId, {
    suspend: { messages: result.messages, tools, conversationId }
  })

  const approvalCalls: ChatApprovalCall[] = calls.map((call) => {
    const capability = getCapability(call.toolId)
    return {
      id: call.callId,
      name: call.toolId,
      title: capability?.title ?? call.toolId,
      riskLevel: capability?.riskLevel
    }
  })
  const ui: ChatApprovalUi = { kind: 'approval', batchId, calls: approvalCalls }
  const content = result.content.trim() || '以下操作风险较高，需要你确认后执行。'

  await addAgentMessage({ conversationId, role: 'assistant', content, toolCalls, ui, executionId })
  await finishAgentExecution(executionId, {
    status: 'pending_approval',
    usage: result.usage,
    costUsd: result.costUsd,
    modelId: modelInfo.modelId,
    providerId: modelInfo.providerId
  })

  return {
    conversationId,
    status: 'pending_confirmation',
    message: { role: 'assistant', content },
    toolCalls,
    pendingApproval: { batchId, calls: approvalCalls },
    ui
  }
}

interface MaterializeFormOptions {
  pending: AgentToolCall[]
  conversationId: number
  executionId: number
  actor: ChatActor
  recordActor: ChatRecordActor
  toolCalls: ToolCallCard[]
}

async function materializeForm(options: MaterializeFormOptions): Promise<ChatResponse | null> {
  for (const call of options.pending) {
    const capability = getCapability(call.function.name)
    if (!capability?.form) continue

    const args = parseJson(call.function.arguments) ?? {}
    const form = await resolveCapabilityForm(capability, options.actor)
    if (!form) continue

    let authorized = true
    if (capability.authorize) {
      try {
        authorized = await capability.authorize(options.actor, args)
      } catch {
        authorized = false
      }
    }
    if (!authorized) {
      return await failForCapability(options, capability, '当前账号没有执行该操作的权限。')
    }

    let preview
    try {
      preview = await capability.preview?.(args, options.actor)
    } catch (error) {
      return await failForCapability(
        options,
        capability,
        error instanceof Error ? error.message : String(error)
      )
    }

    const draft = await createAgentDraft({
      conversationId: options.conversationId,
      ...options.recordActor,
      capabilityId: capability.id,
      payload: args
    })

    const ui: ChatFormUi = {
      kind: 'form',
      capabilityId: capability.id,
      title: capability.title,
      draftId: draft.id,
      form: mergeFormOptions(form, preview),
      initial: args && typeof args === 'object' && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {},
      preview: preview
        ? {
            summary: preview.summary,
            details: preview.details,
            impact: preview.impact,
            warnings: preview.warnings
          }
        : undefined
    }
    const content = preview?.summary
      ? `${preview.summary}\n\n请确认下方表单后提交。`
      : '请确认下方表单后提交。'

    await addAgentMessage({
      conversationId: options.conversationId,
      role: 'assistant',
      content,
      toolCalls: options.toolCalls,
      ui,
      executionId: options.executionId
    })
    await finishAgentExecution(options.executionId, { status: 'pending_approval' })

    return {
      conversationId: options.conversationId,
      status: 'pending_form',
      message: { role: 'assistant', content },
      toolCalls: options.toolCalls,
      ui
    }
  }
  return null
}

async function failForCapability(
  options: MaterializeFormOptions,
  capability: CapabilityDefinition,
  error: string
): Promise<ChatResponse> {
  const content = `无法打开「${capability.title}」：${error}`
  await addAgentMessage({
    conversationId: options.conversationId,
    role: 'assistant',
    content,
    toolCalls: options.toolCalls,
    executionId: options.executionId
  })
  await finishAgentExecution(options.executionId, { status: 'failed', error })
  return {
    conversationId: options.conversationId,
    status: 'failed',
    message: { role: 'assistant', content },
    toolCalls: options.toolCalls,
    error
  }
}

/** Persist an assistant reply produced without a model turn (draft submit). */
export async function persistDirectResult(input: {
  conversationId: number
  executionId: number
  content: string
  summary: string
  capabilityId: string
  capabilityTitle: string
  toolCalls?: ToolCallCard[]
}): Promise<ChatResponse> {
  const ui: ChatUi = {
    kind: 'result',
    capabilityId: input.capabilityId,
    title: input.capabilityTitle,
    summary: input.summary
  }
  await addAgentMessage({
    conversationId: input.conversationId,
    role: 'assistant',
    content: input.content,
    toolCalls: input.toolCalls,
    ui,
    executionId: input.executionId
  })
  return {
    conversationId: input.conversationId,
    status: 'completed' as ChatStatus,
    message: { role: 'assistant', content: input.content },
    toolCalls: input.toolCalls ?? [],
    ui
  }
}

/** Audit sink shared by chat, approvals and draft submission. */
export function createAgentAudit(input: {
  executionId: number
  actor: ChatActor
  source: string
  recordActor: ChatRecordActor
}) {
  return async (entry: AgentAuditEvent): Promise<void> => {
    try {
      await recordAgentToolCall({
        executionId: input.executionId,
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
      await writeAudit(db as Database, {
        actorUserId: input.actor.userId,
        tenantId: input.recordActor.tenantId,
        organizationId: input.recordActor.organizationId,
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
        source: input.source
      })
    } catch {
      // Best-effort audit.
    }
  }
}

/** Run one bounded tool loop for a conversation. */
export async function runChatLoop(input: {
  actor: ChatActor
  recordActor: ChatRecordActor
  messages: AgentMessage[]
  tools: AgentToolDescriptor[]
  executionId: number
  model: AgentModel
  pendingCalls?: AgentToolCall[]
  confirmations?: { approved?: ReadonlySet<string>, rejected?: ReadonlySet<string> }
  source: string
}): Promise<AgentLoopResult> {
  return await runAgentLoop({
    model: input.model,
    registry: moduleTools as never,
    context: input.actor,
    messages: input.messages,
    tools: input.tools,
    pendingCalls: input.pendingCalls,
    confirmations: input.confirmations,
    maxRounds: 3,
    maxToolCalls: 6,
    audit: createAgentAudit({
      executionId: input.executionId,
      actor: input.actor,
      recordActor: input.recordActor,
      source: input.source
    })
  })
}
