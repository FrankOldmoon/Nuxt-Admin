<script setup lang="ts">
/**
 * Inline login form for the chat widget.
 *
 * Credentials go straight to /api/auth/login via useAuth().login() — they
 * never pass through the LLM. Used in two places:
 *  - as the logged-out composer replacement in chatWidget.vue
 *  - as the registered "auth.login" UI card (see useChatUi.ts)
 *
 * Login state is global (useAuth), so the parent composer switches to the
 * normal chat input automatically once the session is established.
 */
const { login, loading } = useAuth()
const { t } = useI18n()

const identifier = ref('')
const password = ref('')
const error = ref('')
const done = ref(false)

async function onSubmit() {
  if (!identifier.value.trim() || !password.value || loading.value) return
  error.value = ''
  try {
    await login(identifier.value.trim(), password.value)
    done.value = true
    password.value = ''
  } catch (e: unknown) {
    error.value = extractErrorMessage(e, t('chat.loginFailed'))
  }
}
</script>

<template>
  <div class="p-3">
    <p
      v-if="done"
      class="flex items-center gap-1.5 text-xs font-medium text-primary"
    >
      <UIcon
        name="i-lucide-check-circle"
        class="size-4 shrink-0"
      />
      {{ t('chat.loginSuccess') }}
    </p>

    <form
      v-else
      class="space-y-2"
      @submit.prevent="onSubmit"
    >
      <input
        v-model="identifier"
        type="text"
        autocomplete="username"
        :placeholder="t('chat.loginIdentifier')"
        class="w-full rounded-lg border border-default bg-default px-3 py-1.5 text-sm text-highlighted outline-none transition-colors focus:border-primary"
      >
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        :placeholder="t('chat.loginPassword')"
        class="w-full rounded-lg border border-default bg-default px-3 py-1.5 text-sm text-highlighted outline-none transition-colors focus:border-primary"
      >
      <p
        v-if="error"
        class="text-xs text-error"
      >
        {{ error }}
      </p>
      <UButton
        type="submit"
        block
        size="sm"
        icon="i-lucide-log-in"
        :loading="loading"
      >
        {{ t('chat.loginSubmit') }}
      </UButton>
    </form>
  </div>
</template>
