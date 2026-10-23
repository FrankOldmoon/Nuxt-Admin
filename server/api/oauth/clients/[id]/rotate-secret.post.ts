import { createError, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { oauthClients } from '~~/server/database/schema'
import { requireAdmin } from '~~/server/utils/auth'
import { generateClientSecret, hashOAuthToken } from '~~/server/utils/oauthServer'

// POST /api/oauth/clients/:id/rotate-secret — admin-only secret rotation.
// Returns the new plaintext secret exactly once; the old secret stops working
// immediately (existing access tokens stay valid until they expire).
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid client id' })
  }

  const [existing] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'OAuth client not found' })
  }
  if (existing.isPublic) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Public clients do not have a secret' })
  }

  const clientSecret = generateClientSecret()
  await db.update(oauthClients)
    .set({ clientSecretHash: hashOAuthToken(clientSecret), updatedAt: new Date() })
    .where(eq(oauthClients.id, id))

  return { clientId: existing.clientId, clientSecret }
})
