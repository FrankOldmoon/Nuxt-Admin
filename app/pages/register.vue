<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: false, middleware: 'guest' })
useSeoMeta({ title: () => t('auth.register.title') })
</script>

<template>
  <UContainer class="flex min-h-[calc(100vh-120px)] items-center justify-center py-12">
    <UCard class="w-full max-w-md">
      <AuthForm mode="register" />
    </UCard>
  </UContainer>
</template>
