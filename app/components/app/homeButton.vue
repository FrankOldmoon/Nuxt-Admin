<script setup lang="ts">
/**
 * "Back to home" button — navigates to the public homepage.
 */
withDefaults(defineProps<{
  /** Show the "Home" label next to the home icon */
  showLabel?: boolean
}>(), { showLabel: false })

const { t } = useI18n()
</script>

<template>
  <UButton
    to="/"
    icon="i-lucide-home"
    color="neutral"
    variant="ghost"
    :label="showLabel ? t('nav.home') : undefined"
  />
</template>