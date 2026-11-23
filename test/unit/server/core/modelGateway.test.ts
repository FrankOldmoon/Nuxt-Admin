import { describe, expect, it, vi } from 'vitest'
import {
  ModelGateway,
  createOpenAiCompatibleProvider,
  parseOpenAiCompletion,
  type ModelProvider
} from '../../../../server/core/modelGateway'

function provider(id: string, chat: ModelProvider['chat']): ModelProvider {
  return { id, chat }
}

describe('parseOpenAiCompletion', () => {
  it('normalizes content, tool calls, usage and model', () => {
    const parsed = parseOpenAiCompletion({
      model: 'gpt-test',
      choices: [{
        message: {
          content: 'hello',
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"v":1}' } },
            { id: 2 },
            null
          ]
        }
      }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
    })
    expect(parsed.content).toBe('hello')
    expect(parsed.toolCalls).toEqual([{ id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"v":1}' } }])
    expect(parsed.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 })
    expect(parsed.model).toBe('gpt-test')
  })

  it('tolerates malformed payloads', () => {
    expect(parseOpenAiCompletion(null)).toEqual({ content: '', toolCalls: [], usage: undefined, model: undefined })
    expect(parseOpenAiCompletion({ choices: 'nope' }).content).toBe('')
  })
})

describe('ModelGateway', () => {
  it('rejects empty or duplicate providers', () => {
    expect(() => new ModelGateway({ providers: [] })).toThrow('requires at least one provider')
    const p = provider('p', async () => ({ content: 'x' }))
    expect(() => new ModelGateway({ providers: [p, p] })).toThrow('Duplicate model provider: p')
  })

  it('retries the same provider before failing', async () => {
    const chat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ content: 'ok' })
    const gateway = new ModelGateway({ providers: [provider('p', chat)], retries: 1 })
    const result = await gateway.complete({ messages: [], model: 'm' })
    expect(result.content).toBe('ok')
    expect(result.provider).toBe('p')
    expect(result.attempts).toBe(2)
  })

  it('stops retrying errors rejected by retryOn', async () => {
    const chat = vi.fn().mockRejectedValue(new Error('Upstream API error (400): invalid schema'))
    const gateway = new ModelGateway({
      providers: [provider('p', chat)],
      retries: 5,
      retryOn: error => !/invalid schema/.test(String(error))
    })
    await expect(gateway.complete({ messages: [], model: 'm' })).rejects.toThrow('invalid schema')
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('retries transient gateway errors matched by retryOn', async () => {
    const chat = vi.fn()
      .mockRejectedValueOnce(new Error('Upstream API error (400): 400001 internal MaaS component'))
      .mockResolvedValueOnce({ content: 'ok' })
    const gateway = new ModelGateway({
      providers: [provider('p', chat)],
      retries: 3,
      retryOn: error => /400001/.test(String(error))
    })
    const result = await gateway.complete({ messages: [], model: 'm' })
    expect(result.content).toBe('ok')
    expect(result.attempts).toBe(2)
  })

  it('falls back to the next provider and can disable fallback', async () => {
    const first = provider('first', async () => {
      throw new Error('down')
    })
    const second = provider('second', async () => ({ content: 'backup' }))

    const gateway = new ModelGateway({ providers: [first, second], retries: 0 })
    const result = await gateway.complete({ messages: [], model: 'm' })
    expect(result.content).toBe('backup')
    expect(result.provider).toBe('second')
    expect(result.attempts).toBe(2)

    const noFallback = new ModelGateway({ providers: [first, second], retries: 0, fallback: false })
    await expect(noFallback.complete({ messages: [], model: 'm' })).rejects.toThrow('down')
  })

  it('enforces the request timeout', async () => {
    const slow = provider('slow', () => new Promise(resolve => setTimeout(() => resolve({ content: 'late' }), 50)))
    const gateway = new ModelGateway({ providers: [slow], timeoutMs: 5, retries: 0 })
    await expect(gateway.complete({ messages: [], model: 'm' })).rejects.toThrow('timed out after 5ms')
  })

  it('estimates cost from model/provider pricing', async () => {
    const gateway = new ModelGateway({
      providers: [provider('p', async () => ({
        content: 'x',
        usage: { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 }
      }))],
      pricing: { 'p:m': { promptPer1kUsd: 0.01, completionPer1kUsd: 0.03 } }
    })
    const result = await gateway.complete({ messages: [], model: 'm' })
    expect(result.costUsd).toBeCloseTo(0.05)
  })
})

describe('createOpenAiCompatibleProvider', () => {
  it('round-trips namespaced tools and history without collisions or mutation', async () => {
    const names = ['sms.students.search', 'sms_students_search', 'sms-students-search', 'tool_reserved', '查询学生', 'a'.repeat(100)]
    const tools = names.map(name => ({ type: 'function', function: { name, parameters: { type: 'object' } } }))
    const calls = names.map((name, i) => ({ id: `c${i}`, type: 'function' as const, function: { name, arguments: '{}' } }))
    const messages = [
      { role: 'assistant' as const, content: '', tool_calls: calls },
      ...calls.map(call => ({ role: 'tool' as const, content: '{}', name: call.function.name, tool_call_id: call.id }))
    ]
    const original = JSON.stringify({ tools, messages })
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const aliases = body.tools.map((tool: { function: { name: string } }) => tool.function.name)
      expect(new Set(aliases).size).toBe(names.length)
      for (const name of aliases) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
      expect(aliases[1]).toBe('sms_students_search')
      expect(body.messages[0].tool_calls.map((call: { function: { name: string } }) => call.function.name)).toEqual(aliases)
      expect(body.messages.slice(1).map((message: { name: string }) => message.name)).toEqual(aliases)
      return new Response(JSON.stringify({ choices: [{ message: { content: '', tool_calls: body.messages[0].tool_calls } }] }))
    })
    const adapter = createOpenAiCompatibleProvider({ baseUrl: 'https://example.test', apiKey: 'test', fetchImpl: fetchImpl as typeof fetch })
    const result = await adapter.chat({ tools, messages })
    expect(result.toolCalls).toEqual(calls)
    expect(JSON.stringify({ tools, messages })).toBe(original)
    // Stable aliases across a fresh provider instance (including resumed turns).
    const other = createOpenAiCompatibleProvider({ baseUrl: 'https://example.test', apiKey: 'test', fetchImpl: fetchImpl as typeof fetch })
    await other.chat({ tools, messages })
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)))
  })

  it('sends credentials server-side and normalizes the response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      model: 'm',
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const adapter = createOpenAiCompatibleProvider({
      baseUrl: 'https://example.test/v1/',
      apiKey: 'secret-key',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    const result = await adapter.chat({ messages: [{ role: 'user', content: 'yo' }], model: 'm' })
    expect(result.content).toBe('hi')
    expect(result.usage?.totalTokens).toBe(3)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key')
  })

  it('requires an API key', async () => {
    const adapter = createOpenAiCompatibleProvider({ baseUrl: 'https://example.test', apiKey: '' })
    await expect(adapter.chat({ messages: [] })).rejects.toThrow('API key is not configured')
  })
})
