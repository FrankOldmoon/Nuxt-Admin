import { getOAuthIssuer, requireOAuthServerEnabled, SUPPORTED_SCOPES } from '~~/server/utils/oauthServer'

// GET /.well-known/openid-configuration — OIDC discovery document.
// Third-party applications point their OIDC client at
// `<issuer>/.well-known/openid-configuration` and everything else is resolved
// from here.
export default defineEventHandler(async (event) => {
  await requireOAuthServerEnabled()
  const issuer = await getOAuthIssuer(event)
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    introspection_endpoint: `${issuer}/api/oauth/introspect`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: [...SUPPORTED_SCOPES],
    claims_supported: [
      'sub', 'iss', 'aud', 'iat', 'exp', 'auth_time', 'nonce',
      'name', 'preferred_username', 'picture', 'gender', 'birthday',
      'email', 'email_verified', 'role'
    ],
    // No end-session endpoint yet; clients fall back to their own logout.
    request_parameter_supported: false
  }
})
