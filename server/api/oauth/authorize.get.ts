import { requireUser } from '~~/server/utils/auth'
import { getOAuthIssuer, scopeListForConsent, validateAuthorizeRequest } from '~~/server/utils/oauthServer'

// GET /api/oauth/authorize — validate an authorize request and return what the
// consent page needs (client identity, scopes, signed-in user).
// Requires a session: the consent page redirects to /login when this answers 401.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  const query = getQuery(event) as Record<string, string | undefined>
  const request = await validateAuthorizeRequest(event, query)

  return {
    issuer: await getOAuthIssuer(event),
    client: {
      clientId: request.client.clientId,
      name: request.client.name,
      description: request.client.description,
      homepageUrl: request.client.homepageUrl,
      logoUrl: request.client.logoUrl
    },
    scopes: scopeListForConsent(request.scopes),
    scope: request.scopes.join(' '),
    redirectUri: request.redirectUri,
    state: request.state,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
    user: { id: auth.user.id, username: auth.user.username, name: auth.user.name, email: auth.user.email }
  }
})
