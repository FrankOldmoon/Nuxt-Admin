<script setup lang="ts">
const { t } = useI18n()

definePageMeta({ layout: false, middleware: 'guest' })
usePageMeta({ title: () => t('auth.forgotPassword.title'), indexable: false })
</script>

<template>
  <UContainer class="flex min-h-[calc(100vh-120px)] items-center justify-center py-12">
    <UCard class="w-full max-w-md">
      <AuthForm
        mode="forgot"
        :redirect-on-success="false"
      />
    </UCard>
  </UContainer>
</template>
