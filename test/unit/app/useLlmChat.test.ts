import { describe, it, expect, vi, afterEach } from 'vitest'
import { tryWebsocket } from '../../../app/composables/useLlmChat'
import type { WsDeps, TryWsResult } from '../../../app/composables/useLlmChat'

/** Minimal controllable WebSocket double. */
class FakeWebSocket {
  url: string
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((e: { code: number, reason: string }) => void) | null = null
  sent: string[] = []
  closed = 0

  constructor(url: string) { this.url = url }
  send(data: string) { this.sent.push(data) }
  close() { this.closed++ }

  emitOpen() { this.onopen?.() }
  emitMessage(payload: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(payload) }) }
  emitError() { this.onerror?.() }
  emitClose(code = 1000, reason = '') { this.onclose?.({ code, reason }) }
}

/** Harness exposing a configurable ws via the getter `h.ws` (read after `run`).
 *  The factory forwards the resolved url, so `h.ws.url` mirrors what the
 *  composeable actually sent to WebSocket. */
function makeHarness(protocol: 'http:' | 'https:' = 'https:') {
  let ws!: FakeWebSocket
  const deps: WsDeps = {
    getWebSocket: (url) => {
      ws = new FakeWebSocket(url)
      return ws
    },
    getLocationHost: () => 'app.example.com',
    getLocationProtocol: () => protocol
  }
  return {
    run: (prompt: string, onDelta?: (d: string) => void) => tryWebsocket(prompt, onDelta, deps),
    get ws(): FakeWebSocket { return ws }
  }
}

async function settle(p: Promise<TryWsResult>): Promise<TryWsResult> {
  return await p
}

describe('tryWebsocket', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds a wss:// URL from the injected host on https', () => {
    const h = makeHarness('https:')
    void h.run('hi')
    expect(h.ws.url).toBe('wss://app.example.com/api/llm/ws')
  })

  it('uses ws:// when the page protocol is http', () => {
    const h = makeHarness('http:')
    void h.run('hi')
    expect(h.ws.url).toBe('ws://app.example.com/api/llm/ws')
  })

  it('sends a chat message on open and streams deltas', async () => {
    const h = makeHarness()
    const deltas: string[] = []
    const p = h.run('Hello', d => deltas.push(d))

    h.ws.emitOpen()
    expect(JSON.parse(h.ws.sent[0]!)).toEqual({
      type: 'chat',
      data: { messages: [{ role: 'user', content: 'Hello' }] }
    })

    h.ws.emitMessage({ type: 'llm:delta', data: { content: 'Hel' } })
    h.ws.emitMessage({ type: 'llm:delta', data: { content: 'lo' } })
    h.ws.emitMessage({ type: 'llm:done', data: { fullContent: 'Hello' } })

    expect(await settle(p)).toEqual({ ok: true, content: 'Hello' })
    expect(deltas).toEqual(['Hel', 'lo'])
  })

  it('ignores non-JSON frames safely', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitMessage({ garbage: true }) // invalid WS data → swallowed
    h.ws.emitOpen()
    h.ws.emitMessage({ type: 'llm:done', data: { fullContent: 'ok' } })
    expect(await settle(p)).toEqual({ ok: true, content: 'ok' })
  })

  it('falls back to fullContent from llm:done', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitOpen()
    h.ws.emitMessage({ type: 'llm:done', data: { fullContent: 'final' } })
    expect(await settle(p)).toEqual({ ok: true, content: 'final' })
  })

  it('resolves ok:false with the message on llm:error (no HTTP fallback)', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitOpen()
    h.ws.emitMessage({ type: 'llm:error', data: { message: 'bad config' } })
    expect(await settle(p)).toEqual({ ok: false, reason: 'bad config' })
  })

  it('supports the aliased "error" frame type', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitOpen()
    h.ws.emitMessage({ type: 'error', data: { message: 'boom' } })
    expect(await settle(p)).toEqual({ ok: false, reason: 'boom' })
  })

  it('resolves ok:false on ws error', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitError()
    const res = await settle(p)
    expect(res.ok).toBe(false)
  })

  it('resolves ok:false when closed early without content, exposing the close code', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitOpen()
    h.ws.emitClose(1006)
    const res = await settle(p)
    expect(res.ok).toBe(false)
    if (res.ok === false) expect(res.reason).toBe('WebSocket closed early: close code=1006')
  })

  it('resolves ok:true on close after content has been buffered', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitOpen()
    h.ws.emitMessage({ type: 'llm:delta', data: { content: 'done' } })
    h.ws.emitClose(1000)
    expect(await settle(p)).toEqual({ ok: true, content: 'done' })
  })

  it('resolves ok:false when the WebSocket constructor throws', async () => {
    const deps: WsDeps = {
      getWebSocket: () => { throw new Error('blocked') },
      getLocationHost: () => 'app.example.com',
      getLocationProtocol: () => 'https:'
    }
    const res = await settle(tryWebsocket('x', undefined, deps))
    expect(res).toEqual({ ok: false, reason: 'blocked' })
  })

  it('times out after 120s without a terminal frame and closes the socket', async () => {
    vi.useFakeTimers()
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitOpen()
    vi.advanceTimersByTime(120_000)
    expect(await settle(p)).toEqual({ ok: false, reason: 'WS generation timeout (120s)' })
    expect(h.ws.closed).toBe(1)
  })

  it('lets a terminal frame win over further messages', async () => {
    const h = makeHarness()
    const p = h.run('x')
    h.ws.emitMessage({ type: 'llm:done', data: { fullContent: 'a' } })
    expect(await settle(p)).toEqual({ ok: true, content: 'a' })
    h.ws.emitMessage({ type: 'llm:error', data: { message: 'late' } })
  })
})
