import type { AgentMessage, AgentToolCall } from './agent'

/** Normalized token usage reported by a provider. */
export interface ModelUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/** Normalized provider-independent response. */
export interface ModelCompletion {
  content: string
  toolCalls?: AgentToolCall[]
  usage?: ModelUsage
  model?: string
  provider?: string
  attempts?: number
  costUsd?: number
}

export interface ModelRequest {
  messages: AgentMessage[]
  /** OpenAI-style tool definitions; providers translate as needed. */
  tools?: unknown[]
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/** A provider adapter (OpenAI-compatible, OpenAI, Anthropic, …). */
export interface ModelProvider {
  id: string
  chat(request: ModelRequest): Promise<Omit<ModelCompletion, 'provider' | 'attempts' | 'costUsd'>>
}

export interface ModelPricing {
  promptPer1kUsd: number
  completionPer1kUsd: number
}

export interface ModelGatewayOptions {
  providers: readonly ModelProvider[]
  /** Retries per provider after the first failed attempt. */
  retries?: number
  /** Per-attempt timeout; 0/undefined disables it. */
  timeoutMs?: number
  /** Try the next provider after retries are exhausted. Defaults to true. */
  fallback?: boolean
  /** Cost table keyed by `model` or `provider:model`. */
  pricing?: Readonly<Record<string, ModelPricing>>
}

function abortable<T>(promise: Promise<T>, timeoutMs: number | undefined, signal?: AbortSignal): Promise<T> {
  if (!timeoutMs && !signal) return promise
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => {
      if (timer) clearTimeout(timer)
      reject(new Error('Model request aborted'))
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (timeoutMs) {
      timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        reject(new Error(`Model request timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

/** Provider-independent gateway with timeout, retry, fallback and cost. */
export class ModelGateway {
  private readonly providers: ModelProvider[]
  private readonly retries: number
  private readonly timeoutMs?: number
  private readonly fallback: boolean
  private readonly pricing: Readonly<Record<string, ModelPricing>>

  constructor(options: ModelGatewayOptions) {
    if (options.providers.length === 0) throw new Error('ModelGateway requires at least one provider')
    const ids = new Set<string>()
    for (const provider of options.providers) {
      if (!provider.id.trim()) throw new Error('Model provider ID must not be empty')
      if (ids.has(provider.id)) throw new Error(`Duplicate model provider: ${provider.id}`)
      ids.add(provider.id)
    }
    this.providers = [...options.providers]
    this.retries = Math.max(0, options.retries ?? 1)
    this.timeoutMs = options.timeoutMs
    this.fallback = options.fallback ?? true
    this.pricing = options.pricing ?? {}
  }

  /** Estimate cost from the configured price table. */
  estimateCost(model: string | undefined, provider: string, usage: ModelUsage | undefined): number | undefined {
    if (!usage) return undefined
    const price = (model && this.pricing[`${provider}:${model}`])
      ?? (model && this.pricing[model])
      ?? this.pricing[provider]
    if (!price) return undefined
    const prompt = usage.promptTokens ?? 0
    const completion = usage.completionTokens ?? 0
    return (prompt / 1000) * price.promptPer1kUsd + (completion / 1000) * price.completionPer1kUsd
  }

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    let lastError: unknown
    let attempts = 0
    const providers = this.fallback ? this.providers : this.providers.slice(0, 1)
    for (const provider of providers) {
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        attempts++
        try {
          const response = await abortable(provider.chat(request), this.timeoutMs, request.signal)
          return {
            ...response,
            provider: provider.id,
            attempts,
            costUsd: this.estimateCost(response.model ?? request.model, provider.id, response.usage)
          }
        } catch (error) {
          lastError = error
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible adapter
// ---------------------------------------------------------------------------

export interface OpenAiCompatibleOptions {
  id?: string
  baseUrl: string
  apiKey: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

interface OpenAiChoice {
  message?: {
    content?: unknown
    tool_calls?: unknown
  }
}

/** Normalize an OpenAI-compatible chat completion response. */
export function parseOpenAiCompletion(json: unknown, model?: string): Omit<ModelCompletion, 'provider' | 'attempts' | 'costUsd'> {
  const payload = (json ?? {}) as {
    model?: unknown
    choices?: unknown
    usage?: { prompt_tokens?: unknown, completion_tokens?: unknown, total_tokens?: unknown }
  }
  const choices = Array.isArray(payload.choices) ? payload.choices as OpenAiChoice[] : []
  const message = choices[0]?.message ?? {}
  const content = typeof message.content === 'string' ? message.content : ''
  const toolCalls: AgentToolCall[] = []
  if (Array.isArray(message.tool_calls)) {
    for (const raw of message.tool_calls) {
      if (!raw || typeof raw !== 'object') continue
      const call = raw as Record<string, unknown>
      const fn = call.function as Record<string, unknown> | undefined
      if (typeof call.id !== 'string' || typeof fn?.name !== 'string') continue
      toolCalls.push({
        id: call.id,
        type: 'function',
        function: {
          name: fn.name,
          arguments: typeof fn.arguments === 'string' ? fn.arguments : '{}'
        }
      })
    }
  }
  const usage = payload.usage
    ? {
        promptTokens: numberOrUndefined(payload.usage.prompt_tokens),
        completionTokens: numberOrUndefined(payload.usage.completion_tokens),
        totalTokens: numberOrUndefined(payload.usage.total_tokens)
      }
    : undefined
  return {
    content,
    toolCalls,
    usage,
    model: typeof payload.model === 'string' ? payload.model : model
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** OpenAI / OpenAI-compatible provider adapter. Credentials stay server-side. */
export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): ModelProvider {
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    id: options.id ?? 'openai-compatible',
    async chat(request) {
      if (!options.apiKey) throw new Error('Model provider API key is not configured')
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.apiKey}`
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          stream: false,
          ...(request.tools?.length ? { tools: request.tools, tool_choice: 'auto' } : {})
        }),
        signal: request.signal
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Upstream API error (${response.status}): ${text.slice(0, 500)}`)
      }
      const json = await response.json() as unknown
      return parseOpenAiCompletion(json, request.model)
    }
  }
}
