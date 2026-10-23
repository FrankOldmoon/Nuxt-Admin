import { getJwks, requireOAuthServerEnabled } from '~~/server/utils/oauthServer'

// GET /.well-known/jwks.json — public keys used to verify id_tokens (RS256).
export default defineEventHandler(async () => {
  await requireOAuthServerEnabled()
  return await getJwks()
})
