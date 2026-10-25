<script setup lang="ts">
/**
 * Header credit balance. Base owns the display; modules decide when credits are
 * spent (tool charges, AI calls, …) and call `refreshCredits()` afterwards.
 */
const { t } = useI18n()
const { isLoggedIn } = useAuth()
const { balance, refresh, reset } = useCredits()

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) void refresh()
  else reset()
}, { immediate: true })

const label = computed(() => (balance.value === null ? '—' : String(balance.value)))
</script>

<template>
  <UTooltip
    v-if="isLoggedIn"
    :text="t('credits.balanceHint')"
  >
    <NuxtLink
      to="/credits"
      class="inline-flex items-center gap-1 rounded-full border border-default px-2.5 py-1 text-xs font-medium text-highlighted transition hover:border-primary/40"
      :aria-label="t('credits.balance')"
    >
      <UIcon
        name="i-lucide-coins"
        class="size-3.5 text-warning"
      />
      {{ label }}
    </NuxtLink>
  </UTooltip>
</template>
