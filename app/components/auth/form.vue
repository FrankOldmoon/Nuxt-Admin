<script setup lang="ts">
import type { PublicUser } from '~/types/auth'

export type AuthMode = 'login' | 'register' | 'forgot'

const props = withDefaults(defineProps<{
  mode?: AuthMode
  redirectOnSuccess?: boolean
}>(), {
  mode: 'login',
  redirectOnSuccess: true
})

const emit = defineEmits<{
  'success': [user: PublicUser | null]
  'update:mode': [mode: AuthMode]
}>()

const { t } = useI18n()
const { login, register, forgotPassword } = useAuth()
const route = useRoute()

// Reuse the app-level public config (site.allowRegistration) cached by app.vue
const { data: publicConfig } = usePublicConfig()
const allowRegistration = computed(() => publicConfig.value?.configs?.['site.allowRegistration'] === 'true')
const captchaEnabled = computed(() => publicConfig.value?.configs?.['security.captchaEnabled'] !== 'false')

const mode = ref<AuthMode>(props.mode)
watch(() => props.mode, (v) => {
  mode.value = v
})

const form = reactive({
  identifier: '',
  username: '',
  email: '',
  password: '',
  passwordConfirm: ''
})

// Dev-only convenience flag. `import.meta.dev` is a compile-time constant, so in
// a production build this is `false` and the branches below are dead code — the
// auto-fill never ships.
const isDev = import.meta.dev

/**
 * In development the API returns the challenge text alongside the image, so the
 * form can type it for the developer instead of making them squint at a wavy
 * picture. Production responses never contain it.
 */

// --- Image captcha (login mode only) ---
const captcha = ref<{ id: string, svg: string } | null>(null)
const captchaText = ref('')
const captchaLoading = ref(false)

async function refreshCaptcha() {
  captchaLoading.value = true
  try {
    const challenge = await $fetch<{ id: string, svg: string, devText?: string }>('/api/auth/captcha')
    captcha.value = challenge
    // Dev-only self-fill. Guarded on the client so SSR never carries a value that
    // the browser would then have to reconcile during hydration.
    captchaText.value = isDev && import.meta.client ? (challenge.devText ?? '') : ''
  } catch {
    captcha.value = null
    captchaText.value = ''
  } finally {
    captchaLoading.value = false
  }
}

// Fetch the challenge after mount only. The SVG (and the dev self-fill that
// types it for the developer) exists only once the request has completed, so
// fetching during SSR would render the image on the server and the "loading"
// placeholder on the client — a hydration mismatch by definition.
onMounted(() => {
  if (mode.value === 'login' && captchaEnabled.value && !captcha.value) void refreshCaptcha()
})

watch(mode, (m) => {
  if (m === 'login' && captchaEnabled.value && !captcha.value) void refreshCaptcha()
})

// --- Third-party sign-in (SSO / OAuth2) ---
const { data: oauthData } = await useAsyncData('auth:oauth', () =>
  $fetch<{ providers: Array<{ name: string }> }>('/api/auth/oauth/providers')
)
const oauthProviders = computed(() => oauthData.value?.providers ?? [])
const providerLabels: Record<string, string> = { github: 'GitHub', google: 'Google', microsoft: 'Microsoft' }

function startOAuth(name: string) {
  window.location.href = `/api/auth/oauth/${name}/login`
}

// In dev, prefill admin credentials on the login form for convenience.
// (`isDev` is hoisted above, next to the captcha handshake.)
if (isDev && props.mode === 'login') {
  form.identifier = 'admin'
  form.password = 'Admin@123'
}

const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const devResetUrl = ref('')

// Surface SSO errors surfaced via ?oauth=error&message=...
const oauthMessage = route.query.message?.toString()
if (oauthMessage) errorMsg.value = decodeURIComponent(oauthMessage)

const titles = computed(() => ({
  login: { title: t('auth.login.title'), subtitle: t('auth.login.subtitle') },
  register: { title: t('auth.register.title'), subtitle: t('auth.register.subtitle') },
  forgot: { title: t('auth.forgotPassword.title'), subtitle: t('auth.forgotPassword.subtitle') }
}[mode.value]))

/**
 * Errors coming from `$fetch` carry ofetch's wrapper text ("[POST] /api/...: 401
 * Unauthorized"). That reads like a stack trace to visitors, so the login path
 * maps the status code to a translated sentence and every other path only falls
 * back to a server-provided message.
 */
function loginErrorMessage(e: unknown): string {
  const err = e as { statusCode?: number, data?: { message?: string } }
  const status = Number(err?.statusCode ?? 0)
  const serverMessage = String(err?.data?.message ?? '')
  if (status === 400 && /captcha/i.test(serverMessage)) return t('auth.errors.captchaInvalid')
  if (status === 400 || status === 401) return t('auth.errors.invalidCredentials')
  if (status === 403) return t('auth.errors.accountDisabled')
  if (status === 423) return t('auth.errors.accountLocked')
  if (status === 429) return t('auth.errors.tooManyAttempts')
  return t('auth.errors.generic')
}

const FETCH_WRAPPER = /^\[(GET|POST|PUT|PATCH|DELETE)\b/

/** Server text when available, never the request-path wrapper or a raw HTTP line. */
function plainErrorMessage(e: unknown, fallback: string): string {
  const err = e as { data?: { message?: string, statusMessage?: string }, message?: string }
  for (const candidate of [err?.data?.message, err?.data?.statusMessage, err?.message]) {
    if (typeof candidate === 'string' && candidate && !FETCH_WRAPPER.test(candidate)) return candidate
  }
  return fallback
}

function switchMode(next: AuthMode) {
  mode.value = next
  errorMsg.value = ''
  successMsg.value = ''
  devResetUrl.value = ''
  emit('update:mode', next)
}

async function submit() {
  errorMsg.value = ''
  successMsg.value = ''
  devResetUrl.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') {
      if (!form.identifier || !form.password) {
        errorMsg.value = t('auth.errors.requiredFields')
        return
      }
      if (captchaEnabled.value && !captchaText.value) {
        errorMsg.value = t('auth.errors.captchaRequired')
        return
      }
      const user = await login(form.identifier, form.password, captcha.value?.id, captchaText.value)
      emit('success', user)
      if (props.redirectOnSuccess) {
        await navigateTo(route.query.redirect?.toString() || '/')
      }
    } else if (mode.value === 'register') {
      if (!form.username || !form.email || !form.password) {
        errorMsg.value = t('auth.errors.requiredFields')
        return
      }
      if (form.password !== form.passwordConfirm) {
        errorMsg.value = t('auth.errors.passwordMismatch')
        return
      }
      if (form.password.length < 8) {
        errorMsg.value = t('auth.errors.passwordTooShort')
        return
      }
      const user = await register(form.username, form.email, form.password)
      emit('success', user)
      if (props.redirectOnSuccess) {
        await navigateTo('/')
      }
    } else {
      // forgot
      if (!form.email) {
        errorMsg.value = t('auth.errors.emailRequired')
        return
      }
      const res = await forgotPassword(form.email)
      successMsg.value = t('auth.forgotPassword.success')
      if (res.devResetUrl) devResetUrl.value = res.devResetUrl
      emit('success', null)
    }
  } catch (e: unknown) {
    errorMsg.value = mode.value === 'login'
      ? loginErrorMessage(e)
      : plainErrorMessage(e, t('auth.errors.generic'))
    // Captcha already consumed/expired: after a failure, refresh with a brand-new captcha
    if (mode.value === 'login' && captchaEnabled.value) refreshCaptcha()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-4">
      <h2 class="text-2xl font-bold text-highlighted">
        {{ titles.title }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ titles.subtitle }}
      </p>
    </div>

    <UAlert
      v-if="errorMsg"
      color="error"
      variant="subtle"
      :title="t('auth.errors.title')"
      :description="errorMsg"
      class="mb-4"
    />
    <UAlert
      v-if="successMsg"
      color="success"
      variant="subtle"
      :title="t('auth.forgotPassword.sent')"
      :description="successMsg"
      class="mb-4"
    />
    <UAlert
      v-if="devResetUrl"
      color="warning"
      variant="subtle"
      :title="t('auth.forgotPassword.devTitle')"
      class="mb-4"
    >
      <template #description>
        <p class="break-all">
          {{ devResetUrl }}
        </p>
      </template>
    </UAlert>

    <form
      class="space-y-4"
      @submit.prevent="submit"
    >
      <!-- Login -->
      <template v-if="mode === 'login'">
        <UFormField
          :label="t('auth.fields.identifier')"
          name="identifier"
        >
          <UInput
            v-model="form.identifier"
            type="text"
            autocomplete="username"
            :placeholder="t('auth.fields.identifierPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('auth.fields.password')"
          name="password"
        >
          <UInput
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            :placeholder="t('auth.fields.passwordPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="captchaEnabled"
          :label="t('auth.fields.captcha')"
          name="captcha"
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="captchaText"
              type="text"
              :placeholder="t('auth.fields.captchaPlaceholder')"
              class="flex-1"
              autocomplete="off"
            />
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded border border-default bg-elevated p-0.5 leading-none transition hover:opacity-80"
              :title="t('auth.fields.captchaRefresh')"
              :disabled="captchaLoading"
              @click="refreshCaptcha"
            >
              <!-- Inline captcha SVG rendering -->
              <span v-if="captcha?.svg" class="block h-10" v-html="captcha.svg" />
              <span v-else class="flex h-10 w-[120px] items-center justify-center text-xs text-muted">{{ captchaLoading ? t('common.loading') : '···' }}</span>
            </button>
          </div>
        </UFormField>
      </template>

      <!-- Register -->
      <template v-else-if="mode === 'register'">
        <UFormField
          :label="t('auth.fields.username')"
          name="username"
        >
          <UInput
            v-model="form.username"
            autocomplete="username"
            :placeholder="t('auth.fields.usernamePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('auth.fields.email')"
          name="email"
        >
          <UInput
            v-model="form.email"
            type="email"
            autocomplete="email"
            :placeholder="t('auth.fields.emailPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('auth.fields.password')"
          name="password"
        >
          <UInput
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('auth.fields.passwordPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('auth.fields.passwordConfirm')"
          name="passwordConfirm"
        >
          <UInput
            v-model="form.passwordConfirm"
            type="password"
            autocomplete="new-password"
            :placeholder="t('auth.fields.passwordConfirmPlaceholder')"
            class="w-full"
          />
        </UFormField>
      </template>

      <!-- Forgot -->
      <template v-else>
        <UFormField
          :label="t('auth.fields.email')"
          name="email"
        >
          <UInput
            v-model="form.email"
            type="email"
            autocomplete="email"
            :placeholder="t('auth.fields.emailPlaceholder')"
            class="w-full"
          />
        </UFormField>
      </template>

      <UButton
        type="submit"
        block
        :loading="loading"
        :label="mode === 'login' ? t('auth.login.submit') : mode === 'register' ? t('auth.register.submit') : t('auth.forgotPassword.submit')"
      />
    </form>

    <!-- Third-party sign-in (SSO) -->
    <div
      v-if="oauthProviders.length && mode === 'login'"
      class="mt-6"
    >
      <div class="flex items-center gap-3 text-xs text-muted">
        <div class="h-px flex-1 bg-default" />
        <span>{{ t('auth.oauth.divider') }}</span>
        <div class="h-px flex-1 bg-default" />
      </div>
      <div class="mt-3 space-y-2">
        <UButton
          v-for="p in oauthProviders"
          :key="p.name"
          block
          variant="outline"
          color="neutral"
          @click="startOAuth(p.name)"
        >
          {{ t('auth.oauth.loginWith', { name: providerLabels[p.name] ?? p.name }) }}
        </UButton>
      </div>
    </div>

    <!-- Mode switcher -->
    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <template v-if="mode === 'login'">
        <UButton
          v-if="allowRegistration"
          variant="link"
          size="sm"
          :label="t('auth.login.noAccount')"
          @click="switchMode('register')"
        />
        <UButton
          variant="link"
          size="sm"
          color="neutral"
          :label="t('auth.login.forgotPassword')"
          @click="switchMode('forgot')"
        />
      </template>
      <template v-else-if="mode === 'register'">
        <UButton
          variant="link"
          size="sm"
          :label="t('auth.register.hasAccount')"
          @click="switchMode('login')"
        />
      </template>
      <template v-else>
        <UButton
          variant="link"
          size="sm"
          :label="t('auth.forgotPassword.backToLogin')"
          @click="switchMode('login')"
        />
      </template>
    </div>

    <p
      v-if="mode === 'login' && isDev"
      class="mt-2 text-xs text-muted"
    >
      {{ t('auth.login.demoHint') }} <code class="font-mono">admin / Admin@123</code>
    </p>
  </div>
</template>
