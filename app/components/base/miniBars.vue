<script setup lang="ts">
/**
 * Lightweight horizontal bar chart (pure CSS, no chart library).
 * Used on the overview page to show each table's record count.
 */
const props = defineProps<{
  items: Array<{ label: string, value: number, icon?: string }>
}>()

const max = computed(() => Math.max(1, ...(props.items ?? []).map(i => i.value).filter(v => v > 0)))
function width(v: number) { return `${Math.round(v / max.value * 100)}%` }
</script>

<template>
  <div class="space-y-2.5">
    <div
      v-for="(it, i) in items"
      :key="`${it.label}-${i}`"
      class="flex items-center gap-3"
    >
      <UIcon v-if="it.icon" :name="it.icon" class="h-4 w-4 shrink-0 text-muted" />
      <span class="w-32 shrink-0 truncate text-sm text-muted">{{ it.label }}</span>
      <div class="h-4 flex-1 overflow-hidden rounded bg-muted/40">
        <div
          class="h-full rounded bg-primary/70 transition-[width] duration-500"
          :style="{ width: it.value > 0 ? width(it.value) : '2px' }"
        />
      </div>
      <span class="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
        {{ it.value < 0 ? '—' : it.value }}
      </span>
    </div>
  </div>
</template>