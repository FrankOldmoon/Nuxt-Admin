/**
 * Shared LLM call logic: config reading and SSE parsing kept consistent with server/api/llm/ws.ts.
 * - loadLlmConfig: read all LLM-related configs table fields in one pass
 * - parseSseLine: parse a single SSE `data: ...` line into a JSON chunk (or null for [DONE])
 * - extractDelta: extract the incremental content text from an OpenAI-style chunk
 * - runLlmChatSync: non-streaming call, returns the full content (for the /api/llm/chat HTTP fallback)
 *
 * All entry points must perform user authentication before using the functions exported
 * from this file; this module does not authenticate.
 */

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

/** Load all LLM configs in one pass and return a typed bag. */
export async function loadLlmConfig() {
  const [apiKey, baseUrl, model, temperature, maxTokens, systemPrompt] = await Promise.all([
    getConfigValue<string>('llm.apiKey', ''),
    getConfigValue<string>('llm.baseUrl', 'https://api.openai.com/v1'),
    getConfigValue<string>('llm.model', 'gpt-4o-mini'),
    getConfigValue<number>('llm.temperature', 0.7),
    getConfigValue<number>('llm.maxTokens', 2048),
    getConfigValue<string>('llm.systemPrompt', 'You are a helpful assistant.')
  ])
  return { apiKey, baseUrl, model, temperature, maxTokens, systemPrompt }
}

/** Parse a single SSE `data:` line into an OpenAI-style chunk object. */
export function parseSseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return null
  try {
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Extract the delta content text from an OpenAI-compatible chunk. */
export function extractDelta(chunk: Record<string, unknown>): string {
  const choices = chunk.choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0] as Record<string, unknown>
  const delta = first.delta as Record<string, unknown> | undefined
  if (typeof delta?.content === 'string') return delta.content
  const message = first.message as Record<string, unknown> | undefined
  if (typeof message?.content === 'string') return message.content
  return ''
}

/**
 * Complete non-streaming (and WebSocket-free) LLM call.
 * Behavior: still requests stream:true upstream, receives SSE and concatenates all deltas
 * into the final text; this works even if the upstream disables the non-streaming endpoint,
 * and for the caller it's still a one-shot Promise<string>.
 */
export async function runLlmChatSync(req: ChatRequest): Promise<string> {
  const cfg = await loadLlmConfig()
  if (!cfg.apiKey) {
    throw new Error('LLM API key is not configured (set llm.apiKey in configs)')
  }
  const messages: ChatMessage[] = [...req.messages]
  const hasSystem = messages.some(m => m.role === 'system')
  if (!hasSystem && cfg.systemPrompt) {
    messages.unshift({ role: 'system', content: cfg.systemPrompt })
  }
  const body = {
    model: req.model || cfg.model,
    messages,
    temperature: req.temperature ?? cfg.temperature,
    max_tokens: req.maxTokens ?? cfg.maxTokens,
    stream: true
  }
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
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
    throw new Error(`Upstream API error (${upstream.status}): ${errText}`)
  }
  if (!upstream.body) {
    throw new Error('Upstream returned no body')
  }
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const chunk = parseSseLine(line)
      if (chunk === null) {
        if (line.trim().startsWith('data: [DONE]')) return fullContent
        continue
      }
      const delta = extractDelta(chunk)
      if (delta) fullContent += delta
    }
  }
  if (buffer.trim()) {
    const chunk = parseSseLine(buffer)
    if (chunk) {
      const delta = extractDelta(chunk)
      if (delta) fullContent += delta
    }
  }
  return fullContent
}

/**
 * Connectivity check: call the /models endpoint with the configured apiKey/baseUrl to
 * verify the upstream is reachable and authentication works.
 * It performs no chat call, so it does not consume generation quota.
 */
export async function testLlmConnection(): Promise<{ ok: boolean, message: string, modelCount?: number }> {
  const cfg = await loadLlmConfig()
  if (!cfg.apiKey) {
    return { ok: false, message: 'LLM API key is not configured (set llm.apiKey in configs)' }
  }
  const baseUrl = cfg.baseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/models`
  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` }
    })
    if (!upstream.ok) {
      const errText = (await upstream.text()).slice(0, 500)
      return { ok: false, message: `Upstream returned HTTP ${upstream.status}: ${errText}` }
    }
    let modelCount: number | undefined
    try {
      const json = await upstream.json() as { data?: unknown[] }
      modelCount = Array.isArray(json.data) ? json.data.length : undefined
    } catch { /* body not JSON — still reachable */ }
    return {
      ok: true,
      message: `Connection OK (${baseUrl})${modelCount !== undefined ? ` · ${modelCount} models` : ''}`
    }
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
