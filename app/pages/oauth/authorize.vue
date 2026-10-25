<script setup lang="ts">
/**
 * OAuth 2.0 / OIDC consent page — `/oauth/authorize`.
 *
 * The OIDC discovery document advertises this path as `authorization_endpoint`.
 * A third-party application sends the browser here with the standard
 * authorize parameters; we validate them server-side (GET /api/oauth/authorize),
 * show what the application is asking for, and on approval POST the decision
 * back. The API returns the final redirect URL the browser must navigate to.
 */
interface ConsentData {
  issuer: string
  client: {
    clientId: string
    name: string
    description: string | null
    homepageUrl: string | null
    logoUrl: string | null
  }
  scopes: { scope: string, description: string }[]
  scope: string
  redirectUri: string
  state: string | null
  nonce: string | null
  codeChallenge: string | null
  codeChallengeMethod: string | null
  user: { id: number, username: string, name: string | null, email: string }
}

definePageMeta({ layout: false, middleware: 'auth' })

const { t } = useI18n()
usePageMeta({ title: () => t('oauthConsent.title'), indexable: false })

const route = useRoute()

const rawQuery = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  for (const key of ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method']) {
    const value = route.query[key]
    if (typeof value === 'string' && value) out[key] = value
  }
  return out
})

const { data, error } = await useAsyncData<ConsentData>(
  'oauth:consent',
  () => cGet<ConsentData>('/api/oauth/authorize', rawQuery.value)
)

const submitting = ref<'approve' | 'deny' | null>(null)
const actionError = ref('')

const errorMessage = computed(() => {
  if (!error.value) return ''
  const msg = typeof error.value.message === 'string' ? error.value.message : ''
  // h3 puts "error: description" into message; show the human-readable part.
  return msg.replace(/^[a-z_]+:\s*/i, '') || t('oauthConsent.invalidRequest')
})

async function decide(action: 'approve' | 'deny') {
  if (!data.value) return
  submitError('')
  submitting.value = action
  try {
    const res = await cPost<{ redirectUrl: string }>('/api/oauth/authorize', {
      ...rawQuery.value,
      action
    })
    // Full-page navigation: the destination belongs to the third-party app.
    window.location.assign(res.redirectUrl)
  } catch (e) {
    actionError.value = extractErrorMessage(e, t('oauthConsent.requestFailed'))
    submitting.value = null
  }
}

function submitError(message: string) {
  actionError.value = message
}

function scopeLabel(scope: string, fallback: string): string {
  const key = `oauthConsent.scope.${scope}`
  return t(key) === key ? fallback : t(key)
}
</script>

<template>
  <UContainer class="flex min-h-screen items-center justify-center py-12">
    <UCard class="w-full max-w-lg">
      <div v-if="error" class="space-y-3">
        <UAlert
          icon="i-lucide-triangle-alert"
          color="error"
          variant="subtle"
          :title="t('oauthConsent.errorTitle')"
          :description="errorMessage"
        />
        <p class="text-xs text-muted">
          {{ t('oauthConsent.errorHint') }}
        </p>
      </div>

      <div v-else-if="data" class="space-y-6">
        <div class="flex items-center gap-3">
          <UAvatar
            :src="data.client.logoUrl || undefined"
            :alt="data.client.name"
            size="3xl"
            icon="i-lucide-app-window"
          />
          <div class="min-w-0">
            <p class="text-sm text-muted">
              {{ t('oauthConsent.subtitle') }}
            </p>
            <h1 class="truncate text-xl font-semibold text-highlighted">
              {{ data.client.name }}
            </h1>
            <a
              v-if="data.client.homepageUrl"
              :href="data.client.homepageUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-primary hover:underline"
            >
              {{ data.client.homepageUrl }}
            </a>
          </div>
        </div>

        <p v-if="data.client.description" class="text-sm text-toned">
          {{ data.client.description }}
        </p>

        <div class="rounded-md border border-default p-3 text-sm">
          <p class="text-muted">
            {{ t('oauthConsent.signedInAs') }}
          </p>
          <p class="font-medium text-highlighted">
            {{ data.user.name || data.user.username }}
            <span class="text-muted">({{ data.user.email }})</span>
          </p>
        </div>

        <div>
          <h2 class="mb-2 text-sm font-medium text-highlighted">
            {{ t('oauthConsent.permissions') }}
          </h2>
          <ul class="space-y-2">
            <li
              v-for="scope in data.scopes"
              :key="scope.scope"
              class="flex items-start gap-2 text-sm text-toned"
            >
              <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{{ scopeLabel(scope.scope, scope.description) }}</span>
            </li>
          </ul>
        </div>

        <UAlert
          v-if="actionError"
          icon="i-lucide-circle-alert"
          color="error"
          variant="subtle"
          :description="actionError"
        />

        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('oauthConsent.deny')"
            :loading="submitting === 'deny'"
            :disabled="!!submitting"
            @click="decide('deny')"
          />
          <UButton
            color="primary"
            :label="t('oauthConsent.approve')"
            :loading="submitting === 'approve'"
            :disabled="!!submitting"
            @click="decide('approve')"
          />
        </div>

        <p class="text-center text-xs text-muted">
          {{ t('oauthConsent.footer', { issuer: data.issuer }) }}
        </p>
      </div>

      <div v-else class="flex justify-center py-10">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
      </div>
    </UCard>
  </UContainer>
</template>
