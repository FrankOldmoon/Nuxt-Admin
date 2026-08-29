<script setup lang="ts">
import type { PublicUser } from '~/types/auth'

const { t } = useI18n()
const { user, fetchUser } = useAuth()
const toast = useToast()
const route = useRoute()

definePageMeta({
  middleware: 'auth'
})
useSeoMeta({ title: () => t('profile.title') })

// Profile form
const profileForm = reactive({ username: '', name: '', email: '', telephone: '', gender: '' as string, birthday: '' as string })
const profileLoading = ref(false)
const profileMsg = ref('')
const profileError = ref('')

// Password form
const passwordForm = reactive({ currentPassword: '', newPassword: '', newPasswordConfirm: '' })
const passwordLoading = ref(false)
const passwordMsg = ref('')
const passwordError = ref('')

// Email verification
const resendLoading = ref(false)
const devVerifyUrl = ref('')

const isEmailVerified = computed(() => !!user.value?.emailVerifiedAt)

const genderOptions = computed(() => [
  { label: t('profile.genderMale'), value: 'male' },
  { label: t('profile.genderFemale'), value: 'female' },
  { label: t('profile.genderOther'), value: 'other' }
])

watchEffect(() => {
  if (user.value) {
    profileForm.username = user.value.username
    profileForm.name = user.value.name ?? ''
    profileForm.telephone = user.value.telephone ?? ''
    profileForm.email = user.value.email
    profileForm.gender = user.value.gender ?? ''
    profileForm.birthday = user.value.birthday ?? ''
  }
})

// Handle redirect from /api/auth/verify-email
watchEffect(() => {
  const verify = route.query.verify
  if (verify === 'success') {
    profileMsg.value = t('profile.emailVerified')
    toast.add({ title: t('profile.emailVerified'), color: 'success' })
  } else if (verify === 'invalid') {
    profileError.value = t('profile.verifyInvalid')
  }
})

async function onAvatarUpdated(updatedUser: PublicUser) {
  user.value = updatedUser
}

function onAvatarError(message: string) {
  toast.add({ title: message, color: 'error' })
}

async function saveProfile() {
  profileError.value = ''
  profileMsg.value = ''
  if (!profileForm.username || !profileForm.email) {
    profileError.value = t('auth.errors.requiredFields')
    return
  }
  profileLoading.value = true
  devVerifyUrl.value = ''
  try {
    const data = await $fetch<{ user: PublicUser, devVerifyUrl?: string }>('/api/auth/profile', {
      method: 'PUT',
      body: {
        name: profileForm.name || null,
        telephone: profileForm.telephone || null,
        email: profileForm.email,
        gender: profileForm.gender || null,
        birthday: profileForm.birthday || null
      }
    })
    await fetchUser()
    profileMsg.value = t('profile.saved')
    if (data.devVerifyUrl) {
      devVerifyUrl.value = data.devVerifyUrl
      profileMsg.value = t('profile.emailChangedDev')
    } else if (profileForm.email !== user.value?.email) {
      // email changed but verification email was sent via SMTP
      profileMsg.value = t('profile.emailChanged')
    }
    toast.add({ title: t('profile.saved'), color: 'success' })
  } catch (e: unknown) {
    profileError.value = isAuthError(e) ? e.message : t('auth.errors.generic')
  } finally {
    profileLoading.value = false
  }
}

async function resendVerification() {
  if (!user.value || isEmailVerified.value) return
  resendLoading.value = true
  devVerifyUrl.value = ''
  try {
    const data = await $fetch<{ devVerifyUrl?: string }>('/api/auth/resend-verification', {
      method: 'POST'
    })
    await fetchUser()
    if (data.devVerifyUrl) {
      devVerifyUrl.value = data.devVerifyUrl
      toast.add({ title: t('profile.verificationDevSent'), color: 'warning' })
    } else {
      toast.add({ title: t('profile.verificationSent'), color: 'success' })
    }
  } catch (e: unknown) {
    toast.add({ title: isAuthError(e) ? e.message : t('auth.errors.generic'), color: 'error' })
  } finally {
    resendLoading.value = false
  }
}

async function changePassword() {
  passwordError.value = ''
  passwordMsg.value = ''
  if (!passwordForm.currentPassword || !passwordForm.newPassword) {
    passwordError.value = t('auth.errors.requiredFields')
    return
  }
  if (passwordForm.newPassword !== passwordForm.newPasswordConfirm) {
    passwordError.value = t('auth.errors.passwordMismatch')
    return
  }
  if (passwordForm.newPassword.length < 8) {
    passwordError.value = t('auth.errors.passwordTooShort')
    return
  }
  passwordLoading.value = true
  try {
    const data = await $fetch<{ user: PublicUser | null }>('/api/auth/password', {
      method: 'PUT',
      body: { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }
    })
    await fetchUser()
    void data
    passwordMsg.value = t('profile.passwordChanged')
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.newPasswordConfirm = ''
    toast.add({ title: t('profile.passwordChanged'), color: 'success' })
  } catch (e: unknown) {
    passwordError.value = isAuthError(e) ? e.message : t('auth.errors.generic')
  } finally {
    passwordLoading.value = false
  }
}
</script>

<template>
  <UContainer class="max-w-2xl py-10">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-highlighted">
        {{ t('profile.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('profile.subtitle') }}
      </p>
    </div>

    <!-- Avatar section -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('avatar.title') }}
        </h2>
      </template>

      <BaseAvatarUploader
        v-if="user"
        :user="user"
        @updated="onAvatarUpdated"
        @error="onAvatarError"
      />
    </UCard>

    <!-- Profile section -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('profile.accountTitle') }}
        </h2>
      </template>

      <UAlert
        v-if="profileError"
        color="error"
        variant="subtle"
        :description="profileError"
        class="mb-4"
      />
      <UAlert
        v-if="profileMsg"
        color="success"
        variant="subtle"
        :description="profileMsg"
        class="mb-4"
      />

      <form
        class="space-y-4"
        @submit.prevent="saveProfile"
      >
        <UFormField
          :label="t('auth.fields.username')"
          name="username"
        >
          <UInput
            :model-value="profileForm.username"
            disabled
            autocomplete="username"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('profile.name')"
          name="name"
        >
          <UInput
            v-model="profileForm.name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('profile.telephone')"
          name="telephone"
        >
          <UInput
            v-model="profileForm.telephone"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('auth.fields.email')"
          name="email"
        >
          <UInput
            v-model="profileForm.email"
            type="email"
            autocomplete="email"
            class="w-full"
          />
          <template #hint>
            <div class="flex items-center gap-2">
              <UBadge
                :color="isEmailVerified ? 'success' : 'warning'"
                :label="isEmailVerified ? t('profile.verified') : t('profile.notVerified')"
                size="sm"
              />
              <UButton
                v-if="!isEmailVerified"
                size="xs"
                variant="link"
                :loading="resendLoading"
                :label="t('profile.resendVerification')"
                @click="resendVerification"
              />
            </div>
          </template>
        </UFormField>
        <UFormField
          :label="t('profile.gender')"
          name="gender"
        >
          <USelectMenu
            v-model="profileForm.gender"
            value-key="value"
            :items="genderOptions"
            :placeholder="t('profile.genderPlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('profile.birthday')"
          name="birthday"
        >
          <UInput
            v-model="profileForm.birthday"
            type="date"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="devVerifyUrl"
          color="warning"
          variant="subtle"
          :title="t('profile.devVerifyTitle')"
          class="mb-2"
        >
          <template #description>
            <p class="break-all">
              {{ devVerifyUrl }}
            </p>
          </template>
        </UAlert>
        <UButton
          type="submit"
          :loading="profileLoading"
          icon="i-lucide-save"
          :label="t('profile.save')"
        />
      </form>
    </UCard>

    <!-- Password section -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">
          {{ t('profile.passwordTitle') }}
        </h2>
      </template>

      <UAlert
        v-if="passwordError"
        color="error"
        variant="subtle"
        :description="passwordError"
        class="mb-4"
      />
      <UAlert
        v-if="passwordMsg"
        color="success"
        variant="subtle"
        :description="passwordMsg"
        class="mb-4"
      />

      <form
        class="space-y-4"
        @submit.prevent="changePassword"
      >
        <UFormField
          :label="t('profile.currentPassword')"
          name="currentPassword"
        >
          <UInput
            v-model="passwordForm.currentPassword"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('profile.newPassword')"
          name="newPassword"
        >
          <UInput
            v-model="passwordForm.newPassword"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="t('auth.fields.passwordConfirm')"
          name="newPasswordConfirm"
        >
          <UInput
            v-model="passwordForm.newPasswordConfirm"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          :loading="passwordLoading"
          icon="i-lucide-key"
          :label="t('profile.changePassword')"
        />
      </form>
    </UCard>
  </UContainer>
</template>
