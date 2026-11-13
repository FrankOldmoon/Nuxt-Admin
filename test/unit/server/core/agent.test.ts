import { describe, expect, it, vi } from 'vitest'
import {
  describeAgentTools,
  extractUiDirective,
  runAgentLoop,
  type AgentAuditEvent,
  type AgentMessage,
  type AgentModel,
  type AgentModelTurn,
  type AgentToolCall
} from '../../../../server/core/agent'
import { ToolRegistry, UiRegistry } from '../../../../server/core/moduleSdk'

interface TestActor {
  userId: number
  permissions: string[]
}

function call(id: string, name: string, args = '{}'): AgentToolCall {
  return { id, type: 'function', function: { name, arguments: args } }
}

function scriptedModel(turns: AgentModelTurn[], onCall?: (messages: AgentMessage[]) => void): AgentModel {
  let index = 0
  return async (messages) => {
    onCall?.(messages)
    const turn = turns[Math.min(index, turns.length - 1)]!
    index++
    return turn
  }
}

function makeRegistry() {
  const registry = new ToolRegistry<TestActor>()
  registry.register({
    id: 'echo',
    schema: {},
    inputJsonSchema: { type: 'object', properties: { v: { type: 'number' } } },
    description: 'Echo a value',
    permission: 'echo:read',
    operation: 'query',
    authorize: actor => actor.permissions.includes('echo:read') || actor.permissions.includes('*'),
    execute: input => ({ echoed: input })
  })
  const command = vi.fn(() => ({ ok: true }))
  registry.register({
    id: 'notes.delete',
    schema: {},
    description: 'Delete notes',
    operation: 'command',
    approval: 'confirm',
    authorize: () => true,
    execute: command
  })
  return { registry, command }
}

const actor: TestActor = { userId: 1, permissions: ['echo:read'] }
const toolsFor = (registry: ToolRegistry<TestActor>) => describeAgentTools(registry as never, actor.permissions)

describe('describeAgentTools', () => {
  it('filters tools the actor may not use', () => {
    const { registry } = makeRegistry()
    registry.register({ id: 'admin.only', schema: {}, permission: 'admin:read', execute: () => null })
    const tools = describeAgentTools(registry as never, ['echo:read'])
    expect(tools.map(tool => tool.name)).toEqual(['echo', 'notes.delete'])
    expect(describeAgentTools(registry as never, ['*']).map(tool => tool.name)).toContain('admin.only')
  })

  it('defaults commands to confirm and exposes JSON schemas', () => {
    const { registry } = makeRegistry()
    const tools = describeAgentTools(registry as never, ['*'])
    expect(tools.find(tool => tool.name === 'notes.delete')?.approval).toBe('confirm')
    expect(tools.find(tool => tool.name === 'echo')?.parameters).toMatchObject({ type: 'object' })
  })
})

describe('runAgentLoop', () => {
  it('executes a tool call, feeds the result back and completes', async () => {
    const { registry } = makeRegistry()
    const audits: AgentAuditEvent[] = []
    let secondRound: AgentMessage[] = []

    const result = await runAgentLoop({
      model: scriptedModel([
        { content: '', toolCalls: [call('c1', 'echo', '{"v":1}')] },
        { content: 'All done' }
      ], (messages) => { secondRound = [...messages] }),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'echo' }],
      tools: toolsFor(registry),
      audit: (event) => { audits.push(event) }
    })

    expect(result.status).toBe('completed')
    if (result.status === 'completed') {
      expect(result.content).toBe('All done')
      expect(result.toolCalls).toBe(1)
    }
    expect(secondRound.some(message => message.role === 'tool' && message.tool_call_id === 'c1')).toBe(true)
    expect(audits).toEqual([{ toolId: 'echo', callId: 'c1', outcome: 'success' }])
  })

  it('returns unknown tools to the model as recoverable errors', async () => {
    const { registry } = makeRegistry()
    const audits: AgentAuditEvent[] = []

    const result = await runAgentLoop({
      model: scriptedModel([
        { content: '', toolCalls: [call('c1', 'does.not.exist')] },
        { content: 'Recovered' }
      ]),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'x' }],
      tools: toolsFor(registry),
      audit: (event) => { audits.push(event) }
    })

    expect(result.status).toBe('completed')
    expect(result.messages.some(message => message.role === 'tool' && message.content.includes('Unknown tool'))).toBe(true)
    expect(audits[0]).toMatchObject({ outcome: 'denied', error: 'unknown-tool' })
  })

  it('pauses commands for confirmation without executing them', async () => {
    const { registry, command } = makeRegistry()
    const pendingResult = await runAgentLoop({
      model: scriptedModel([{ content: 'Need confirmation', toolCalls: [call('cmd1', 'notes.delete')] }]),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'delete' }],
      tools: toolsFor(registry)
    })

    expect(pendingResult.status).toBe('pending_confirmation')
    expect(command).not.toHaveBeenCalled()
    if (pendingResult.status !== 'pending_confirmation') return
    expect(pendingResult.pending.map(call => call.id)).toEqual(['cmd1'])

    const resumed = await runAgentLoop({
      model: scriptedModel([{ content: 'Deleted' }]),
      registry: registry as never,
      context: actor,
      messages: pendingResult.messages,
      tools: toolsFor(registry),
      pendingCalls: pendingResult.pending,
      confirmations: { approved: new Set(['cmd1']) }
    })
    expect(command).toHaveBeenCalledTimes(1)
    expect(resumed.status).toBe('completed')
  })

  it('returns a rejection to the model without executing the command', async () => {
    const { registry, command } = makeRegistry()
    const result = await runAgentLoop({
      model: scriptedModel([{ content: '', toolCalls: [call('cmd1', 'notes.delete')] }, { content: 'Cancelled' }]),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'delete' }],
      tools: toolsFor(registry),
      confirmations: { rejected: new Set(['cmd1']) }
    })

    expect(command).not.toHaveBeenCalled()
    expect(result.messages.some(message => message.role === 'tool' && message.content.includes('User rejected'))).toBe(true)
    expect(result.status).toBe('completed')
  })

  it('reports authorization failures as tool errors', async () => {
    const { registry } = makeRegistry()
    const audits: AgentAuditEvent[] = []
    const result = await runAgentLoop({
      model: scriptedModel([{ content: '', toolCalls: [call('c1', 'echo')] }, { content: 'Denied' }]),
      registry: registry as never,
      context: { userId: 2, permissions: [] } as TestActor,
      messages: [{ role: 'user', content: 'x' }],
      tools: toolsFor(registry),
      audit: (event) => { audits.push(event) }
    })

    expect(result.messages.some(message => message.role === 'tool' && message.content.includes('authorization denied'))).toBe(true)
    expect(audits[0]).toMatchObject({ outcome: 'failure' })
  })

  it('enforces round and tool-call limits', async () => {
    const { registry } = makeRegistry()
    const loop = await runAgentLoop({
      model: scriptedModel([{ content: '', toolCalls: [call('c1', 'echo')] }]),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'x' }],
      tools: toolsFor(registry),
      maxRounds: 2
    })
    expect(loop.status).toBe('failed')
    if (loop.status === 'failed') expect(loop.error).toContain('Max tool rounds exceeded')

    const calls = await runAgentLoop({
      model: scriptedModel([{ content: '', toolCalls: [call('1', 'echo'), call('2', 'echo'), call('3', 'echo')] }]),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'x' }],
      tools: toolsFor(registry),
      maxToolCalls: 2
    })
    expect(calls.status).toBe('failed')
    if (calls.status === 'failed') expect(calls.error).toContain('Tool call limit exceeded')
  })

  it('returns invalid JSON arguments to the model', async () => {
    const { registry } = makeRegistry()
    const result = await runAgentLoop({
      model: scriptedModel([{ content: '', toolCalls: [call('c1', 'echo', '{broken')] }, { content: 'ok' }]),
      registry: registry as never,
      context: actor,
      messages: [{ role: 'user', content: 'x' }],
      tools: toolsFor(registry)
    })
    expect(result.messages.some(message => message.role === 'tool' && message.content.includes('Invalid tool arguments'))).toBe(true)
  })
})

describe('extractUiDirective', () => {
  function registry() {
    const ui = new UiRegistry<Record<string, unknown>, Record<string, unknown>>()
    ui.register({ id: 'example.status', version: '1.0', schema: {}, render: props => props })
    return ui
  }

  it('extracts and validates a registered component', () => {
    const text = 'Here you go.\n```ui\n{"ui":"example.status","version":"1.0","presentation":{"mode":"inline"}}\n```'
    const result = extractUiDirective(text, registry())
    expect(result.content).toBe('Here you go.')
    expect(result.ui).toEqual({
      component: 'example.status',
      version: '1.0',
      presentation: { mode: 'inline' }
    })
  })

  it('drops unknown components and version mismatches', () => {
    expect(extractUiDirective('x\n```ui\n{"ui":"system.shell"}\n```', registry()).error)
      .toContain('Unknown ui component')
    expect(extractUiDirective('x\n```ui\n{"ui":"example.status","version":"2.0"}\n```', registry()).error)
      .toContain('version mismatch')
    expect(extractUiDirective('x\n```ui\n{broken}\n```', registry()).error)
      .toContain('Invalid ui block JSON')
  })

  it('leaves plain content untouched', () => {
    expect(extractUiDirective('plain answer', registry())).toEqual({ content: 'plain answer' })
  })
})
