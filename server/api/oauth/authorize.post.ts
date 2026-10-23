import { requireUser } from '~~/server/utils/auth'
import {
  buildAuthorizeRedirect,
  createAuthorizationCode,
  validateAuthorizeRequest
} from '~~/server/utils/oauthServer'

// POST /api/oauth/authorize — consent decision.
// body: { client_id, redirect_uri, scope, state?, nonce?, code_challenge?, code_challenge_method?, action: 'approve' | 'deny' }
// Returns { redirectUrl } — the consent page performs a full-page navigation to it
// (the destination is owned by the third-party application).
//
// Every request parameter is re-validated here: the consent page is untrusted
// input and must not be able to widen scopes or redirect to an unregistered URI.
export default defineEventHandler(async (event) => {
  const auth = await requireUser(event)
  const body = await readBody<Record<string, string | undefined>>(event)

  const request = await validateAuthorizeRequest(event, {
    client_id: body?.client_id,
    redirect_uri: body?.redirect_uri,
    response_type: 'code',
    scope: body?.scope,
    state: body?.state,
    nonce: body?.nonce,
    code_challenge: body?.code_challenge,
    code_challenge_method: body?.code_challenge_method
  })

  if (body?.action !== 'approve') {
    return {
      redirectUrl: buildAuthorizeRedirect(request.redirectUri, {
        error: 'access_denied',
        error_description: 'The user denied the authorization request',
        state: request.state
      })
    }
  }

  const code = await createAuthorizationCode({
    client: request.client,
    userId: auth.user.id,
    redirectUri: request.redirectUri,
    scopes: request.scopes,
    nonce: request.nonce,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod
  })

  console.log('[oauth-server] code issued | client:', request.client.clientId, '| user:', auth.user.id, '| scope:', request.scopes.join(' '))

  return {
    redirectUrl: buildAuthorizeRedirect(request.redirectUri, {
      code,
      state: request.state
    })
  }
})
