/**
 * HTTP (non-streaming) LLM chat API.
 * Fallback for the WebSocket flow: when the browser cannot establish a ws
 * connection (cookie policy / network issues / ...), the frontend can fall
 * back to a plain POST; the caller and the config reading are identical to ws.ts.
 *
 * POST /api/llm/chat
 *  Body:
 *    {
 *      "messages": [{ "role": "user", "content": "Hello" }, ...],
 *      "model": "...",          // optional override
 *      "temperature": 0.7,      // optional override
 *      "maxTokens": 2048        // optional override
 *    }
 *  Response:
 *    { "content": "The complete model output text" }
 *
 * Authentication: the main project's unified chain (requireUser — session cookie)
 */
import type { PublicUser } from '~/types/auth'

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

export default defineEventHandler(async (event) => {
  // 1. Auth: use the same requireUser (session cookie) as every business API
  const ctx = await requireUser(event)
  const user = ctx.user as unknown as PublicUser

  if (!user.isActive || (user as { deletedAt?: Date | null }).deletedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Account is disabled or deleted' })
  }

  // 2. Read the body
  let body: ChatRequest
  try {
    body = await readBody(event) as ChatRequest
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid JSON body' })
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw createError({ statusCode: 400, message: '"messages" array is required and must not be empty' })
  }
  for (const m of body.messages) {
    if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
      throw createError({ statusCode: 400, message: 'Each message must have { role, content } strings' })
    }
  }

  // 3. Call the shared LLM logic
  try {
    const content = await runLlmChatSync({
      messages: body.messages,
      model: body.model,
      temperature: body.temperature,
      maxTokens: body.maxTokens
    })
    return { content }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw createError({ statusCode: 502, message: msg })
  }
})

