/**
 * WebSocket streaming LLM API (OpenAI-compatible).
 *
 * Connect:   ws://host/api/llm/ws  (cookie-based session auth, same as /api/ws)
 * Send:       { "type": "chat", "data": {
 *                "messages": [{ "role": "user", "content": "Hello" }, ...],
 *                "model": "gpt-4o-mini",          // optional override
 *                "temperature": 0.7,               // optional override
 *                "maxTokens": 2048                  // optional override
 *              }}
 * Receive:    { "type": "llm:delta",  "data": { "content": "Hi" } }   (per-token)
 *             { "type": "llm:done",   "data": { "fullContent": "..." } }
 *             { "type": "llm:error",  "data": { "message": "..." } }
 *
 * Configs (read from the configs table via getConfigValue):
 *   llm.apiKey        OpenAI-compatible API key
 *   llm.baseUrl        Base URL (default https://api.openai.com/v1)
 *   llm.model          Default model name
 *   llm.temperature    Default temperature (0-2)
 *   llm.maxTokens      Default max tokens
 *   llm.systemPrompt   Default system prompt
 */

import { loadLlmConfig, parseSseLine, extractDelta } from '~~/server/utils/llm'
// Note: parseSessionToken / verifySessionToken / findUserById all live under
// server/utils, so Nuxt auto-imports them within the server directory — they
// must not be (and need not be) imported explicitly, so that the globalThis
// mocks in the unit tests are intercepted correctly.

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
}

export default defineWebSocketHandler({
  async upgrade(request) {
    // Use the main project's unified session-cookie auth (same as /api/ws).
    // upgrade receives an UpgradeRequest (a native Request extension, not a
    // full H3Event), so we go through readSessionTokenFromRaw and then unify
    // via verifySessionToken + a user lookup.
    const token = readSessionTokenFromRaw(request)
    const userId = token ? await verifySessionToken(token) : null
    if (!userId) {
      throw new Response('Unauthorized: Invalid or expired session, please log in again', { status: 401, statusText: 'Unauthorized' })
    }
    const user = await findUserById(userId)
    if (!user || !user.isActive || user.deletedAt) {
      throw new Response('Forbidden: Account is disabled or deleted', { status: 403, statusText: 'Forbidden' })
    }
    request.context.userId = userId
    request.context.username = user.username
  },

  async open(peer) {
    const ctx = peer.context as { userId?: number }
    if (!ctx?.userId) {
      peer.close(4001, 'No user context')
      return
    }
    peer.send(JSON.stringify({
      type: 'connected',
      data: { message: 'LLM streaming WebSocket connected' }
    }))
  },

  async message(peer, message) {
    const ctx = peer.context as { userId?: number }
    if (!ctx?.userId) return

    const rawText = message.text()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawText)
    } catch {
      peer.send(JSON.stringify({ type: 'error', data: { message: 'Invalid JSON' } }))
      return
    }

    if (parsed.type !== 'chat') {
      peer.send(JSON.stringify({ type: 'error', data: { message: `Unknown type: ${String(parsed.type)}` } }))
      return
    }

    const data = (parsed.data ?? {}) as ChatRequest
    if (!Array.isArray(data.messages) || data.messages.length === 0) {
      peer.send(JSON.stringify({ type: 'llm:error', data: { message: 'messages array is required and must not be empty' } }))
      return
    }

    // Load configs
    const cfg = await loadLlmConfig()
    if (!cfg.apiKey) {
      peer.send(JSON.stringify({ type: 'llm:error', data: { message: 'LLM API key is not configured (set llm.apiKey in configs)' } }))
      return
    }

    // Build the request payload — prepend system prompt if not already present
    const messages: ChatMessage[] = [...data.messages]
    const hasSystem = messages.some(m => m.role === 'system')
    if (!hasSystem && cfg.systemPrompt) {
      messages.unshift({ role: 'system', content: cfg.systemPrompt })
    }

    const body = {
      model: data.model || cfg.model,
      messages,
      temperature: data.temperature ?? cfg.temperature,
      max_tokens: data.maxTokens ?? cfg.maxTokens,
      stream: true
    }

    const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`

    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify(body)
      })

      if (!upstream.ok) {
        const errText = await upstream.text()
        peer.send(JSON.stringify({
          type: 'llm:error',
          data: { message: `Upstream API error (${upstream.status}): ${errText}` }
        }))
        return
      }

      if (!upstream.body) {
        peer.send(JSON.stringify({
          type: 'llm:error',
          data: { message: 'Upstream returned no body' }
        }))
        return
      }

      // Stream SSE lines from the upstream response
      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines (terminated by \n)
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const chunk = parseSseLine(line)
          if (chunk === null) {
            // null means either [DONE] or unparseable — if [DONE], finish
            if (line.trim().startsWith('data: [DONE]')) {
              peer.send(JSON.stringify({
                type: 'llm:done',
                data: { fullContent }
              }))
              return
            }
            continue
          }
          const delta = extractDelta(chunk)
          if (delta) {
            fullContent += delta
            peer.send(JSON.stringify({
              type: 'llm:delta',
              data: { content: delta }
            }))
          }
        }
      }

      // Flush any remaining buffer
      if (buffer.trim()) {
        const chunk = parseSseLine(buffer)
        if (chunk) {
          const delta = extractDelta(chunk)
          if (delta) {
            fullContent += delta
            peer.send(JSON.stringify({
              type: 'llm:delta',
              data: { content: delta }
            }))
          }
        }
      }

      // If upstream didn't send explicit [DONE], signal completion
      peer.send(JSON.stringify({
        type: 'llm:done',
        data: { fullContent }
      }))
    } catch (e) {
      peer.send(JSON.stringify({
        type: 'llm:error',
        data: { message: e instanceof Error ? e.message : String(e) }
      }))
    }
  },

  close(_peer) {
    // Nothing to clean up — no global registry for LLM sessions
  },

  error(_peer, error) {
    if (import.meta.dev) {
      console.error('[llm-ws] error:', error)
    }
  }
})
