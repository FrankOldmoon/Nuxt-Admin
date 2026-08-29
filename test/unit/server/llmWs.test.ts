import { describe, it, expect, vi, beforeEach } from 'vitest'

// server/api/llm/ws.ts relies on Nuxt server auto-imports (defineWebSocketHandler,
// readSessionTokenFromRaw, verifySessionToken, findUserById, getConfigValue)
// and calls the global fetch to forward chat requests to an upstream
// OpenAI-compatible API. Mocks are injected via globalThis.
const h = vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>
  const captured: Record<string, unknown> = {}
  g.defineWebSocketHandler = (opts: Record<string, unknown>) => {
    Object.assign(captured, opts)
    return opts
  }
  g.SESSION_COOKIE_NAME = 'session'
  const fetchMock = vi.fn()
  g.fetch = fetchMock
  const mocks = {
    verifySessionToken: vi.fn(),
    findUserById: vi.fn(),
    getConfigValue: vi.fn()
  }
  Object.assign(g, mocks)
  return { captured, fetchMock, ...mocks }
})

import { readSessionTokenFromRaw } from '../../../server/utils/session'
;(globalThis as Record<string, unknown>).readSessionTokenFromRaw = readSessionTokenFromRaw

import llmHandler from '../../../server/api/llm/ws'

const handler = (typeof llmHandler?.upgrade === 'function' ? llmHandler : h.captured) as {
  upgrade: (request: any) => Promise<void>
  open: (peer: any) => Promise<void>
  message: (peer: any, message: any) => Promise<void>
  close: (peer: any) => void
  error: (peer: any, error: Error) => void
}

const activeUser = {
  id: 5, username: 'alice', email: 'a@x.com', passwordHash: 'h', roleId: 2,
  isActive: true, deletedAt: null, emailVerifiedAt: null, name: null, telephone: null,
  avatarPath: null, gender: null, birthday: null, lastLoginAt: null, lastLoginIp: null,
  createdAt: new Date(), updatedAt: new Date()
}

/** Default LLM config: can be overridden via partial */
const defaultConfig: Record<string, unknown> = {
  'llm.apiKey': 'sk-test-key',
  'llm.baseUrl': 'https://upstream.test/v1',
  'llm.model': 'gpt-default',
  'llm.temperature': 0.7,
  'llm.maxTokens': 2048,
  'llm.systemPrompt': 'You are a helpful assistant.'
}

function setConfig(overrides: Record<string, unknown> = {}) {
  const cfg = { ...defaultConfig, ...overrides }
  h.getConfigValue.mockImplementation(async (key: string, fallback: unknown) =>
    key in cfg ? cfg[key] : fallback)
}

function makeRequest(cookie: string | null) {
  return {
    headers: { get: (name: string) => (name === 'cookie' ? cookie : null) },
    context: {} as Record<string, unknown>
  }
}

function makePeer(userId?: number) {
  return {
    context: userId === undefined ? {} : { userId },
    send: vi.fn(),
    close: vi.fn()
  }
}

function makeMessage(raw: string) {
  return { text: () => raw }
}

function sent(peer: any) {
  return peer.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string))
}

/** Build an SSE streaming upstream response */
function sseResponse(lines: string[], init: { ok?: boolean; status?: number; body?: unknown } = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    }
  })
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: init.body === null ? null : stream,
    text: async () => 'upstream-error-text'
  } as unknown as Response
}

beforeEach(() => {
  h.verifySessionToken.mockReset()
  h.findUserById.mockReset()
  h.getConfigValue.mockReset()
  h.fetchMock.mockReset()
  h.verifySessionToken.mockImplementation(async () => null)
  h.findUserById.mockImplementation(async () => activeUser)
  setConfig()
})

describe('upgrade connection auth', () => {
  it('throws 401 without a cookie', async () => {
    const err = await handler.upgrade(makeRequest(null)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Response)
    expect((err as Response).status).toBe(401)
  })

  it('throws 403 when the user does not exist', async () => {
    h.verifySessionToken.mockImplementation(async () => 5)
    h.findUserById.mockImplementation(async () => null)
    const err = await handler.upgrade(makeRequest('session=t')).catch((e: unknown) => e)
    expect((err as Response).status).toBe(403)
  })

  it('writes userId and username after authentication', async () => {
    h.verifySessionToken.mockImplementation(async () => 5)
    const req = makeRequest('session=t')
    await handler.upgrade(req)
    expect(req.context.userId).toBe(5)
    expect(req.context.username).toBe('alice')
  })
})

describe('open connection establishment', () => {
  it('closes the connection with 4001 without a userId context', async () => {
    const peer = makePeer()
    await handler.open(peer)
    expect(peer.close).toHaveBeenCalledWith(4001, 'No user context')
    expect(peer.send).not.toHaveBeenCalled()
  })

  it('pushes a connected message on a normal connection', async () => {
    const peer = makePeer(5)
    await handler.open(peer)
    expect(sent(peer)[0]).toEqual({
      type: 'connected',
      data: { message: 'LLM streaming WebSocket connected' }
    })
  })
})

describe('message request validation', () => {
  it('ignores messages from an unauthenticated peer', async () => {
    const peer = makePeer()
    await handler.message(peer, makeMessage('{"type":"chat"}'))
    expect(peer.send).not.toHaveBeenCalled()
  })

  it('errors on invalid JSON', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage('not-json'))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Invalid JSON' } })
  })

  it('errors on a non-chat type', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({ type: 'foo' })))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Unknown type: foo' } })
  })

  it('returns llm:error when messages is missing or empty', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'chat', data: { messages: [] }
    })))
    expect(sent(peer)[0]).toMatchObject({
      type: 'llm:error',
      data: { message: expect.stringContaining('messages array is required') }
    })
  })

  it('returns llm:error without contacting upstream when llm.apiKey is unset', async () => {
    setConfig({ 'llm.apiKey': '' })
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'chat', data: { messages: [{ role: 'user', content: 'hi' }] }
    })))
    expect(sent(peer)[0]).toMatchObject({
      type: 'llm:error',
      data: { message: expect.stringContaining('llm.apiKey') }
    })
    expect(h.fetchMock).not.toHaveBeenCalled()
  })
})

describe('chat upstream forwarding', () => {
  const chatRaw = JSON.stringify({
    type: 'chat',
    data: { messages: [{ role: 'user', content: 'Hello' }] }
  })

  it('forwards upstream with the configured URL/auth header and request body', async () => {
    h.fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n']))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://upstream.test/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-key')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: 'gpt-default',
      temperature: 0.7,
      max_tokens: 2048,
      stream: true
    })
    // the default system prompt is prepended when no system message is provided
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' })
  })

  it('request-level overrides of model/temperature/maxTokens; an existing system is not re-prepended', async () => {
    h.fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n']))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'chat',
      data: {
        model: 'gpt-custom',
        temperature: 0.2,
        maxTokens: 128,
        messages: [
          { role: 'system', content: 'custom sys' },
          { role: 'user', content: 'hi' }
        ]
      }
    })))
    const body = JSON.parse((h.fetchMock.mock.calls[0] as unknown[])[1] && (h.fetchMock.mock.calls[0] as any)[1].body)
    expect(body).toMatchObject({ model: 'gpt-custom', temperature: 0.2, max_tokens: 128 })
    expect(body.messages[0]).toEqual({ role: 'system', content: 'custom sys' })
    expect(body.messages).toHaveLength(2)
  })

  it('trims a trailing slash from baseUrl', async () => {
    setConfig({ 'llm.baseUrl': 'https://upstream.test/v1/' })
    h.fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n']))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    expect(h.fetchMock.mock.calls[0][0]).toBe('https://upstream.test/v1/chat/completions')
  })

  it('parses the SSE stream and pushes llm:delta per chunk, ending with llm:done', async () => {
    h.fetchMock.mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
      'data: [DONE]\n'
    ]))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'llm:delta', data: { content: 'Hel' } })
    expect(msgs[1]).toEqual({ type: 'llm:delta', data: { content: 'lo' } })
    expect(msgs[2]).toEqual({ type: 'llm:done', data: { fullContent: 'Hello' } })
    expect(peer.send).toHaveBeenCalledTimes(3)
  })

  it('still sends llm:done when upstream never sends [DONE] (including delta left in the buffer)', async () => {
    h.fetchMock.mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}' // last line has no newline
    ]))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'llm:delta', data: { content: 'A' } })
    expect(msgs[1]).toEqual({ type: 'llm:delta', data: { content: 'B' } })
    expect(msgs[2]).toEqual({ type: 'llm:done', data: { fullContent: 'AB' } })
  })

  it('deltas in message.content form are also parsed', async () => {
    h.fetchMock.mockResolvedValue(sseResponse([
      'data: {"choices":[{"message":{"content":"Hi"}}]}\n',
      'data: [DONE]\n'
    ]))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'llm:delta', data: { content: 'Hi' } })
    expect(msgs[1]).toEqual({ type: 'llm:done', data: { fullContent: 'Hi' } })
  })

  it('pushes llm:error with the status code when upstream returns non-2xx', async () => {
    h.fetchMock.mockResolvedValue(sseResponse([], { ok: false, status: 500 }))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    expect(sent(peer)[0]).toEqual({
      type: 'llm:error',
      data: { message: 'Upstream API error (500): upstream-error-text' }
    })
  })

  it('pushes llm:error when upstream has no body', async () => {
    h.fetchMock.mockResolvedValue(sseResponse([], { body: null }))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    expect(sent(peer)[0]).toEqual({
      type: 'llm:error',
      data: { message: 'Upstream returned no body' }
    })
  })

  it('pushes llm:error when fetch throws', async () => {
    h.fetchMock.mockRejectedValueOnce(new Error('network down'))
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(chatRaw))
    expect(sent(peer)[0]).toEqual({
      type: 'llm:error',
      data: { message: 'network down' }
    })
  })
})

describe('close/error hooks', () => {
  it('close and error do not throw', () => {
    const peer = makePeer(5)
    expect(() => handler.close(peer)).not.toThrow()
    expect(() => handler.error(peer, new Error('boom'))).not.toThrow()
  })
})
