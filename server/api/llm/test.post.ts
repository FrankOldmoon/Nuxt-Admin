// POST /api/llm/test — verifies connectivity with the configured LLM upstream.
// Requires admin (dashboard "System Config - LLM" tab uses this button).
import { requireAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await testLlmConnection()
})
