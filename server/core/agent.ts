import type { ModelUsage } from './modelGateway'
import type { ToolDefinition, ToolRegistry } from './moduleSdk'

/** Minimal lookup shape so any UiRegistry<Props, Result> can be passed. */
export interface UiComponentLookup {
  get(id: string): { version?: string } | undefined
}

/** OpenAI-compatible tool call emitted by the model. */
export interface AgentToolCall {
  id: string
  type?: 'function'
  function: { name: string, arguments: string }
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
  tool_calls?: AgentToolCall[]
}

export interface AgentModelTurn {
  content: string
  toolCalls?: AgentToolCall[]
  usage?: ModelUsage
  costUsd?: number
  model?: string
  provider?: string
}

export interface AgentToolDescriptor {
  name: string
  description: string
  parameters: Record<string, unknown>
  operation: 'query' | 'command'
  approval: 'none' | 'confirm' | 'second-person'
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval: boolean
  moduleId?: string
}

export type AgentModel = (messages: AgentMessage[], tools: AgentToolDescriptor[]) => Promise<AgentModelTurn>

export interface AgentAuditEvent {
  toolId: string
  callId: string
  outcome: 'success' | 'failure' | 'denied'
  error?: string
  moduleId?: string
  riskLevel?: 'low' | 'medium' | 'high'
  args?: unknown
  resultSize?: number
  durationMs?: number
}

export interface AgentLoopOptions {
  model: AgentModel
  registry: ToolRegistry<unknown>
  context: unknown
  messages: AgentMessage[]
  tools: AgentToolDescriptor[]
  /** Calls from a previous `pending_confirmation` result to resume. */
  pendingCalls?: AgentToolCall[]
  maxRounds?: number
  maxToolCalls?: number
  /** Decisions for command calls returned as `pending_confirmation`. */
  confirmations?: { approved?: ReadonlySet<string>, rejected?: ReadonlySet<string> }
  audit?: (event: AgentAuditEvent) => void | Promise<void>
}

export interface AgentCompleted {
  status: 'completed'
  content: string
  messages: AgentMessage[]
  toolCalls: number
  usage?: ModelUsage
  costUsd?: number
}

export interface AgentPendingConfirmation {
  status: 'pending_confirmation'
  content: string
  pending: AgentToolCall[]
  messages: AgentMessage[]
  toolCalls: number
  usage?: ModelUsage
  costUsd?: number
}

export interface AgentFailed {
  status: 'failed'
  error: string
  messages: AgentMessage[]
  toolCalls: number
  usage?: ModelUsage
  costUsd?: number
}

export type AgentLoopResult = AgentCompleted | AgentPendingConfirmation | AgentFailed

function toolMessage(call: AgentToolCall, payload: unknown): AgentMessage {
  return {
    role: 'tool',
    tool_call_id: call.id,
    name: call.function.name,
    content: JSON.stringify(payload)
  }
}

function needsConfirmation(descriptor: AgentToolDescriptor | undefined): boolean {
  if (!descriptor) return false
  if (descriptor.requiresApproval) return true
  if (descriptor.riskLevel === 'high' || descriptor.riskLevel === 'medium') return true
  return descriptor.operation === 'command' && descriptor.approval !== 'none'
}

/** Describe registered tools for the model, filtering by caller permission. */
export function describeAgentTools(
  registry: ToolRegistry<unknown>,
  permissions: readonly string[] = []
): AgentToolDescriptor[] {
  const admin = permissions.includes('*')
  return registry.list()
    .filter(tool => !tool.permission || admin || permissions.includes(tool.permission))
    .map((tool) => {
      const definition = tool as Partial<ToolDefinition>
      const riskLevel = definition.riskLevel ?? (tool.operation === 'command' ? 'medium' : 'low')
      return {
        name: tool.id,
        description: definition.description ?? tool.id,
        parameters: tool.inputJsonSchema ?? { type: 'object', properties: {} },
        operation: tool.operation ?? 'query',
        approval: tool.approval ?? (tool.operation === 'command' ? 'confirm' : 'none'),
        riskLevel,
        requiresApproval: definition.requiresApproval ?? riskLevel === 'high',
        moduleId: definition.moduleId
      }
    })
}

/**
 * Run a bounded multi-round tool-calling loop.
 *
 * - Every tool execution re-authorizes through the registry and is audited.
 * - Commands requiring approval stop the loop and return `pending_confirmation`
 *   without executing anything from that round.
 * - Rejections/unknown tools/invalid arguments are returned to the model as
 *   tool error messages so it can recover, still bounded by max rounds/calls.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const messages = [...options.messages]
  const maxRounds = options.maxRounds ?? 4
  const maxToolCalls = options.maxToolCalls ?? 8
  const approved = options.confirmations?.approved ?? new Set<string>()
  const rejected = options.confirmations?.rejected ?? new Set<string>()
  let toolCalls = 0
  const usage: ModelUsage = {}
  let hasUsage = false
  let costUsd = 0
  const addUsage = (next?: ModelUsage) => {
    if (!next) return
    hasUsage = true
    usage.promptTokens = (usage.promptTokens ?? 0) + (next.promptTokens ?? 0)
    usage.completionTokens = (usage.completionTokens ?? 0) + (next.completionTokens ?? 0)
    usage.totalTokens = (usage.totalTokens ?? 0) + (next.totalTokens ?? 0)
  }
  const usageFields = () => ({
    ...(hasUsage ? { usage } : {}),
    ...(costUsd > 0 ? { costUsd } : {})
  })

  const audit = async (event: AgentAuditEvent) => {
    try {
      await options.audit?.(event)
    } catch {
      // Auditing must never break the conversation; persistence errors are the
      // audit sink's responsibility.
    }
  }

  let resumeCalls = options.pendingCalls
  for (let round = 0; round < maxRounds; round++) {
    let content = ''
    let calls: AgentToolCall[]

    if (resumeCalls?.length) {
      // The assistant tool_calls message is already in `messages`; execute the
      // pending calls first, then let the model continue.
      calls = resumeCalls
      resumeCalls = undefined
    } else {
      let turn: AgentModelTurn
      try {
        turn = await options.model(messages, options.tools)
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          messages,
          toolCalls,
          ...usageFields()
        }
      }
      addUsage(turn.usage)
      costUsd += turn.costUsd ?? 0
      content = turn.content
      calls = turn.toolCalls ?? []
      messages.push({
        role: 'assistant',
        content,
        ...(calls.length > 0 ? { tool_calls: calls } : {})
      })
      if (calls.length === 0) {
        return { status: 'completed', content, messages, toolCalls, ...usageFields() }
      }
    }

    // A command without an explicit decision blocks this round entirely.
    const pending = calls.filter((call) => {
      const descriptor = options.tools.find(tool => tool.name === call.function.name)
      return needsConfirmation(descriptor)
        && !approved.has(call.id)
        && !rejected.has(call.id)
    })
    if (pending.length > 0) {
      return {
        status: 'pending_confirmation',
        content,
        pending,
        messages,
        toolCalls,
        ...usageFields()
      }
    }

    for (const call of calls) {
      toolCalls++
      if (toolCalls > maxToolCalls) {
        return { status: 'failed', error: `Tool call limit exceeded (${maxToolCalls})`, messages, toolCalls, ...usageFields() }
      }

      const descriptor = options.tools.find(tool => tool.name === call.function.name)
      if (!descriptor) {
        messages.push(toolMessage(call, { error: `Unknown tool: ${call.function.name}` }))
        await audit({ toolId: call.function.name, callId: call.id, outcome: 'denied', error: 'unknown-tool' })
        continue
      }
      if (needsConfirmation(descriptor) && rejected.has(call.id)) {
        messages.push(toolMessage(call, { error: 'User rejected this command' }))
        await audit({
          toolId: descriptor.name,
          callId: call.id,
          outcome: 'denied',
          error: 'user-rejected',
          moduleId: descriptor.moduleId,
          riskLevel: descriptor.riskLevel
        })
        continue
      }

      let args: unknown
      try {
        args = parseArguments(call.function.arguments)
      } catch (error) {
        messages.push(toolMessage(call, { error: error instanceof Error ? error.message : String(error) }))
        await audit({
          toolId: descriptor.name,
          callId: call.id,
          outcome: 'failure',
          error: 'invalid-arguments',
          moduleId: descriptor.moduleId,
          riskLevel: descriptor.riskLevel
        })
        continue
      }

      const startedAt = Date.now()
      try {
        const result = await options.registry.run(descriptor.name, args, options.context)
        messages.push(toolMessage(call, result ?? null))
        await audit({
          toolId: descriptor.name,
          callId: call.id,
          outcome: 'success',
          moduleId: descriptor.moduleId,
          riskLevel: descriptor.riskLevel,
          args,
          resultSize: safeSize(result),
          durationMs: Date.now() - startedAt
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        messages.push(toolMessage(call, { error: message }))
        await audit({
          toolId: descriptor.name,
          callId: call.id,
          outcome: 'failure',
          error: message,
          moduleId: descriptor.moduleId,
          riskLevel: descriptor.riskLevel,
          args,
          durationMs: Date.now() - startedAt
        })
      }
    }
  }

  return { status: 'failed', error: `Max tool rounds exceeded (${maxRounds})`, messages, toolCalls, ...usageFields() }
}

function safeSize(value: unknown): number | undefined {
  try {
    return JSON.stringify(value ?? null)?.length ?? 0
  } catch {
    return undefined
  }
}

function parseArguments(raw: string): unknown {
  if (!raw || !raw.trim()) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('Invalid tool arguments JSON')
  }
}

export interface AgentUiDirective {
  component: string
  version?: string
  presentation?: Record<string, unknown>
}

export interface AgentUiExtraction {
  content: string
  ui?: AgentUiDirective
  error?: string
}

/**
 * Validate and strip a trailing ```ui block. The model can only reference a
 * registered component (optionally with a matching version); unknown or
 * mismatched components are dropped rather than rendered.
 */
export function extractUiDirective(content: string, registry: UiComponentLookup): AgentUiExtraction {
  const pattern = /```ui\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let last: RegExpExecArray | null = null
  while ((match = pattern.exec(content)) !== null) last = match
  if (!last) return { content }

  const cleaned = (content.slice(0, last.index) + content.slice(last.index + last[0].length)).trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(last[1]!.trim()) as Record<string, unknown>
  } catch {
    return { content: cleaned, error: 'Invalid ui block JSON' }
  }

  const component = typeof parsed.ui === 'string' ? parsed.ui : ''
  if (!component) return { content: cleaned, error: 'Missing ui component id' }

  const registered = registry.get(component)
  if (!registered) return { content: cleaned, error: `Unknown ui component: ${component}` }

  const version = typeof parsed.version === 'string' ? parsed.version : undefined
  if (registered.version && version && registered.version !== version) {
    return { content: cleaned, error: `UI component version mismatch: ${component}` }
  }
  const presentation = parsed.presentation && typeof parsed.presentation === 'object'
    ? parsed.presentation as Record<string, unknown>
    : undefined

  return { content: cleaned, ui: { component, version, presentation } }
}
