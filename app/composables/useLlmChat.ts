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
 */

type DeltaCallback = (chunk: string) => void
type TryWsResult = { ok: true, content: string } | { ok: false, reason: string }

/**
 * Calls the LLM to generate full text content.
 *
 * @param prompt  user input (sent as a single user message)
 * @param onDelta optional: called with each incremental chunk, used by the
 *                import modal to write Monaco in real time
 */
export async function streamLlmChat(prompt: string, onDelta?: DeltaCallback): Promise<string> {
  if (!import.meta.client) {
    throw new Error('streamLlmChat can only be called in the browser (needs WebSocket / main project session cookie)')
  }

  // Try WebSocket first
  const wsResult = await tryWebsocket(prompt, onDelta)
  if (wsResult.ok) return wsResult.content

  // WS failed: likely the cookie wasn't sent (401/1006), or a network policy.
  // Fall back to HTTP: Nitro/$fetch same-origin requests send the cookie (incl. httpOnly) automatically and are more tolerant of path/policy.
  const reason = wsResult.reason || '(unknown)'
  if (import.meta.dev) {
    // eslint-disable-next-line no-console
    console.warn('[useLlmChat] WebSocket unavailable, falling back to HTTP. WS failure reason:', reason)
  }
  try {
    const { content } = await $fetch<{ content: string }>('/api/llm/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: prompt }] }
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
    const hint =
      msg.includes('401') || msg.includes('Unauthorized')
        ? ' (the main project session has expired — please log in again there)'
        : msg.includes('403') || msg.includes('Forbidden')
          ? ' (the account is disabled or lacks access permission)'
          : msg.includes('502')
            ? ' (LLM upstream call failed — check backend LLM config: apiKey/baseUrl/model)'
            : ''
    throw new Error(`LLM call failed: ${msg}${hint}`)
  }
}

function tryWebsocket(prompt: string, onDelta?: DeltaCallback): Promise<TryWsResult> {
  return new Promise((resolve) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/llm/ws`
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (e) {
      resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) })
      return
    }

    let fullContent = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      try { ws.close() } catch { /* ignore */ }
      resolve({ ok: false, reason: 'WS generation timeout (120s)' })
    }, 120_000)

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'chat',
        data: { messages: [{ role: 'user', content: prompt }] }
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
          if (settled) return
          settled = true
          clearTimeout(timeout)
          const final = (msg.data.fullContent as string) || fullContent
          try { ws.close() } catch { /* ignore */ }
          resolve({ ok: true, content: final })
          break
        }
        case 'llm:error':
        case 'error': {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          const m = (msg.data?.message as string) || 'LLM returned an error'
          try { ws.close() } catch { /* ignore */ }
          // Explicit LLM errors (e.g. bad config) do NOT fall back to HTTP;
          // still wrap them as ok:false so the caller gets a reason for better error display
          resolve({ ok: false, reason: m })
          break
        }
      }
    }

    ws.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ ok: false, reason: 'WebSocket onerror (usually a 401/403 handshake or network blocking)' })
    }

    ws.onclose = (e) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (fullContent === '' && e.code !== 1000) {
        const reason = e.reason || `close code=${e.code}`
        resolve({ ok: false, reason: `WebSocket closed early: ${reason}` })
      } else {
        resolve({ ok: true, content: fullContent })
      }
    }
  })
}

export function useLlmChat() {
  return { streamLlmChat }
}
