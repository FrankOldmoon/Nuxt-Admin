import { listKnownOAuthProviders, getOAuthProviderCredentials } from '~~/server/utils/oauth'

/**
 * GET /api/auth/oauth/providers
 * Public list of enabled OAuth providers (secrets never exposed). The login
 * page uses this to render the third-party sign-in buttons.
 */
export default defineEventHandler(async () => {
  const providers: Array<{ name: string }> = []
  for (const name of listKnownOAuthProviders()) {
    const { enabled, clientId } = await getOAuthProviderCredentials(name)
    if (enabled && clientId) providers.push({ name })
  }
  return { providers }
})
