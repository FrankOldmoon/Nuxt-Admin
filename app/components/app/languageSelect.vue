<script setup lang="ts">
/**
 * Shared language switcher — a globe button (optionally with the current
 * language name) that opens the locale dropdown. Used by the home page header
 * and the dashboard sidebar.
 */
withDefaults(defineProps<{
  /** Show the current locale name next to the globe icon */
  showLabel?: boolean
}>(), { showLabel: false })

const { t, locale, locales, setLocale } = useI18n()

const current = computed(() =>
  (locales.value as Array<{ code: string, name: string }>).find(l => l.code === locale.value)?.name || ''
)

const items = computed(() =>
  (locales.value as Array<{ code: string, name: string }>).map(l => ({
    label: l.name,
    icon: l.code === locale.value ? 'i-lucide-check' : undefined,
    onSelect: () => setLocale(l.code as typeof locale.value)
  }))
)
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start' }">
    <UButton
      icon="i-lucide-languages"
      color="neutral"
      variant="ghost"
      :label="showLabel ? current : undefined"
      :aria-label="t('nav.language')"
    />
  </UDropdownMenu>
</template>