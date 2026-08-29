<script setup lang="ts">
const { t } = useI18n()
const { resetPassword } = useAuth()
const route = useRoute()

definePageMeta({ layout: false })
useSeoMeta({ title: () => t('auth.resetPassword.title') })

const token = computed(() => (route.query.token as string) || '')
const password = ref('')
const passwordConfirm = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

async function onSubmit() {
  errorMsg.value = ''
  successMsg.value = ''
  if (!token.value) {
    errorMsg.value = t('auth.resetPassword.noToken')
    return
  }
  if (password.value !== passwordConfirm.value) {
    errorMsg.value = t('auth.errors.passwordMismatch')
    return
  }
  if (password.value.length < 8) {
    errorMsg.value = t('auth.errors.passwordTooShort')
    return
  }
  loading.value = true
  try {
    await resetPassword(token.value, password.value)
    successMsg.value = t('auth.resetPassword.success')
    setTimeout(() => navigateTo('/'), 1500)
  } catch (e: unknown) {
    errorMsg.value = isAuthError(e) ? e.message : t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100vh-120px)] items-center justify-center py-12">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('auth.resetPassword.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ t('auth.resetPassword.subtitle') }}
        </p>
      </template>

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
        :title="t('auth.resetPassword.successTitle')"
        :description="successMsg"
        class="mb-4"
      />

      <form
        class="space-y-4"
        @submit.prevent="onSubmit"
      >
        <UFormField
          :label="t('auth.fields.password')"
          name="password"
        >
          <UInput
            v-model="password"
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
            v-model="passwordConfirm"
            type="password"
            autocomplete="new-password"
            :placeholder="t('auth.fields.passwordConfirmPlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="loading"
          :label="t('auth.resetPassword.submit')"
        />
      </form>
    </UCard>
  </UContainer>
</template>
