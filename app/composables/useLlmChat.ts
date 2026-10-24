/**
 * Unified LLM call composable.
 *
 * Authentication:
 *   1. WebSocket same-origin to /api/llm/ws — the browser automatically
 *      carries the main project session cookie;
 *   2. if the WS handshake fails (typically 401 not logged in, or blocked
 *      by network policy), it automatically falls back to POST /api/llm/chat
 *      (also using the same cookie session).
 *
 * Usage:
 *   const { streamLlmChat } = useLlmChat()
 *   const text = await streamLlmChat('Hello', (delta) => { ... })
 *   // Multi-turn: pass the full history instead of a single prompt
 *   await streamLlmChat([{ role: 'user', content: 'Hi' }], (delta) => { ... }, signal)
 */

type DeltaCallback = (chunk: string) => void
export type TryWsResult = { ok: true, content: string } | { ok: false, reason: string }

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** A single prompt (wrapped as one user message) or an explicit message history. */
export type LlmChatInput = string | LlmChatMessage[]

function toMessages(input: LlmChatInput): LlmChatMessage[] {
  return typeof input === 'string' ? [{ role: 'user', content: input }] : input
}

/** Injectable WebSocket dependencies — lets `tryWebsocket` run as a pure
 *  function in node (unit tests) while defaulting to the browser globals. */
export interface WsDeps {
  getWebSocket: (url: string) => WebSocket
  getLocationHost: () => string
  getLocationProtocol: () => string
}

function defaultWsDeps(): WsDeps {
  return {
    getWebSocket: url => new WebSocket(url),
    getLocationHost: () => window.location.host,
    getLocationProtocol: () => window.location.protocol
  }
}

/**
 * Calls the LLM to generate full text content.
 *
 * @param input   user input (a single prompt, or a full message history for
 *                multi-turn conversations)
 * @param onDelta optional: called with each incremental chunk, used by the
 *                import modal to write Monaco in real time
 * @param signal  optional: aborts an in-flight request (WebSocket or HTTP)
 */
export async function streamLlmChat(input: LlmChatInput, onDelta?: DeltaCallback, signal?: AbortSignal): Promise<string> {
  if (!import.meta.client) {
    throw new Error('streamLlmChat can only be called in the browser (needs WebSocket / main project session cookie)')
  }

  const messages = toMessages(input)

  // Try WebSocket first
  const wsResult = await tryWebsocket(messages, onDelta, undefined, signal)
  if (wsResult.ok) return wsResult.content
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // WS failed: likely the cookie wasn't sent (401/1006), or a network policy.
  // Fall back to HTTP: Nitro/$fetch same-origin requests send the cookie (incl. httpOnly) automatically and are more tolerant of path/policy.
  const reason = wsResult.reason || '(unknown)'
  if (import.meta.dev) {
    console.warn('[useLlmChat] WebSocket unavailable, falling back to HTTP. WS failure reason:', reason)
  }
  try {
    const { content } = await $fetch<{ content: string }>('/api/llm/chat', {
      method: 'POST',
      body: { messages },
      signal
    })
    // HTTP is non-streaming; hand the whole chunk to onDelta once so the UI behaves uniformly
    if (content && onDelta) onDelta(content)
    return content ?? ''
  } catch (e: unknown) {
    // Surface the real error instead of swallowing it
    const msg = e instanceof Error
      ? e.message
      : typeof (e as { statusMessage?: string })?.statusMessage === 'string'
        ? (e as { statusMessage: string }).statusMessage
        : String(e)
    // Attach a human-readable hint for common error codes
    const hint
      = msg.includes('401') || msg.includes('Unauthorized')
        ? ' (the main project session has expired — please log in again there)'
        : msg.includes('403') || msg.includes('Forbidden')
          ? ' (the account is disabled or lacks access permission)'
          : msg.includes('502')
            ? ' (LLM upstream call failed — check backend LLM config: apiKey/baseUrl/model)'
            : ''
    throw new Error(`LLM call failed: ${msg}${hint}`, { cause: e })
  }
}

export function tryWebsocket(input: LlmChatInput, onDelta?: DeltaCallback, deps: WsDeps = defaultWsDeps(), signal?: AbortSignal): Promise<TryWsResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, reason: 'aborted' })
      return
    }

    const messages = toMessages(input)
    const protocol = deps.getLocationProtocol() === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${deps.getLocationHost()}/api/llm/ws`
    let ws: WebSocket
    try {
      ws = deps.getWebSocket(url)
    } catch (e) {
      resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) })
      return
    }

    let fullContent = ''
    let settled = false

    // Single exit point: settle once, stop the timer, detach the abort listener
    // and close the socket so callers can rely on a clean teardown.
    function finish(result: TryWsResult) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      resolve(result)
    }
    const onAbort = () => finish({ ok: false, reason: 'aborted' })

    const timeout = setTimeout(() => finish({ ok: false, reason: 'WS generation timeout (120s)' }), 120_000)
    signal?.addEventListener('abort', onAbort, { once: true })

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'chat',
        data: { messages }
      }))
    }

    ws.onmessage = (event) => {
      let msg: { type: string, data: Record<string, unknown> }
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      switch (msg.type) {
        case 'llm:delta': {
          const d = (msg.data.content as string) || ''
          if (d) {
            fullContent += d
            if (onDelta) onDelta(d)
          }
          break
        }
        case 'llm:done': {
          finish({ ok: true, content: (msg.data.fullContent as string) || fullContent })
          break
        }
        case 'llm:error':
        case 'error': {
          // Explicit LLM errors (e.g. bad config) do NOT fall back to HTTP;
          // still wrap them as ok:false so the caller gets a reason for better error display
          finish({ ok: false, reason: (msg.data?.message as string) || 'LLM returned an error' })
          break
        }
      }
    }

    ws.onerror = () => finish({ ok: false, reason: 'WebSocket onerror (usually a 401/403 handshake or network blocking)' })

    ws.onclose = (e) => {
      if (fullContent === '' && e.code !== 1000) {
        const reason = e.reason || `close code=${e.code}`
        finish({ ok: false, reason: `WebSocket closed early: ${reason}` })
      } else {
        finish({ ok: true, content: fullContent })
      }
    }
  })
}

export function useLlmChat() {
  return { streamLlmChat }
}
