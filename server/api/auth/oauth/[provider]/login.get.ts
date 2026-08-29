import { createError, getRouterParam, getRequestURL, sendRedirect } from 'h3'
import { isKnownOAuthProvider, getOAuthProviderCredentials, buildAuthorizeUrl, buildOAuthRedirectUri } from '~~/server/utils/oauth'

/**
 * GET /api/auth/oauth/:provider/login
 * Initiate a third-party OAuth2 sign-in: the caller (login page button) is
 * redirected here, and this handler 302-redirects to the provider's authorize
 * page. The provider callbacks into `/api/auth/oauth/:provider/callback`.
 */
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  if (!isKnownOAuthProvider(provider)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `Unknown OAuth provider: ${provider}` })
  }
  const { enabled, clientId } = await getOAuthProviderCredentials(provider!)
  if (!enabled || !clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `OAuth provider "${provider}" is not configured`
    })
  }

  const origin = getRequestURL(event).origin
  const redirectUri = buildOAuthRedirectUri(origin, provider!)
  const url = await buildAuthorizeUrl(provider!, redirectUri)
  return sendRedirect(event, url, 302)
})