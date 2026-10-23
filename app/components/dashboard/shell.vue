<script setup lang="ts">
/**
 * Shared dashboard shell — sidebar + tabs bar + main column.
 *
 * Rendered ONCE by `app/layouts/dashboard.vue` so the sidebar keeps its
 * scroll position (and its DOM) across route changes.  Pages must NOT wrap
 * their content in this component anymore — they only render the inner
 * content and the layout slots it into the main column.
 */
import type { DashboardMenuItem } from '~/types/dashboard'

defineProps<{
  activeTable?: string
}>()

// Load sidebar/menu metadata (shared for every dashboard page).
const { data: metaData } = await useDashboardMeta()

const menu = computed<DashboardMenuItem[]>(() => metaData.value?.menu ?? [])
</script>

<template>
  <div class="flex min-h-[calc(100vh-var(--header-height,0px))]">
    <DashboardSidebar
      :items="menu"
      :active-table="activeTable"
    />

    <main class="flex-1 min-w-0 flex flex-col">
      <DashboardTabsBar />
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <slot />
      </div>
    </main>
  </div>
</template>
