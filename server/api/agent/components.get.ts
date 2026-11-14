// GET /api/agent/components — chat components visible to the current actor.
//
// The browser renders only ids from this catalog; `interactions.edit` already
// accounts for the actor's permissions, so the UI never offers an edit action
// the server would reject.
import { requireUser } from '~~/server/utils/auth'
import { moduleUi } from '~~/server/utils/moduleRuntime'
import { describeChatComponents } from '~~/server/core/componentCatalog'

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  return {
    components: describeChatComponents(moduleUi.list(), ctx.role?.permissions ?? [])
  }
})
