<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: false, middleware: 'guest' })
useSeoMeta({ title: () => t('auth.login.title') })

const route = useRoute()

function onSuccess() {
  const redirect = route.query.redirect?.toString()
  navigateTo(redirect || '/')
}
</script>

<template>
  <UContainer class="flex min-h-[calc(100vh-120px)] items-center justify-center py-12">
    <UCard class="w-full max-w-md">
      <AuthForm
        mode="login"
        @success="onSuccess"
      />
    </UCard>
  </UContainer>
</template>
