<script setup lang="ts">
/**
 * Shared dashboard shell — sidebar + common layout.
 * Pages:
 *   pages/dashboard.vue            (overview — no active table)
 *   pages/dashboard/[table].vue    (CRUD or custom page per table)
 * Both wrap their content inside this shell so that sidebar
 * is rendered once and the URL convention stays consistent.
 */
import type { DashboardMenuItem } from '~/types/dashboard'

defineProps<{
  activeTable?: string
}>()

const emit = defineEmits<{
  navigate: [table: string]
}>()

// Load sidebar/menu metadata (shared for every dashboard page).
const { data: metaData, error: metaError, refresh: refreshMeta } = await useDashboardMeta()

const menu = computed<DashboardMenuItem[]>(() => metaData.value?.menu ?? [])

function onSidebarNavigate(path: string) { emit('navigate', path) }
</script>

<template>
  <div class="flex min-h-[calc(100vh-var(--header-height,0px))]">
    <DashboardSidebar
      :items="menu"
      :active-table="activeTable"
      @navigate="onSidebarNavigate"
    />

    <main class="flex-1 min-w-0 flex flex-col">
      <DashboardTabsBar />
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <slot
          :menu="menu"
          :meta-data="metaData"
          :meta-error="metaError"
          :refresh-meta="refreshMeta"
        />
      </div>
    </main>
  </div>
</template>
