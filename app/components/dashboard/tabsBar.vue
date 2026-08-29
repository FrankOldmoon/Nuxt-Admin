<script setup lang="ts">
/**
 * Dashboard top bar: browser-like multi-tab bar + breadcrumb below it.
 * Rendered inside DashboardShell (main column, above page content);
 * preserves state together with page keepalive.
 */
const route = useRoute()
const { t } = useI18n()
const { tabs, track, close, isActive } = useDashboardTabs()

// Automatically add the current page to the tabs when the route changes
watch(() => route.fullPath, () => track(route), { immediate: true })
// Pages are keepalive-cached; when a cached page is reactivated (e.g. after a
// tab was closed) the mount-time watch/immediate won't run again, so re-track
// here to make sure the tab reappears.
onActivated(() => track(route))

// Breadcrumb: Dashboard / <table label>
const table = computed(() => {
  if (typeof route.params?.table === 'string') return route.params.table
  const last = route.path.split('/').filter(Boolean).pop()
  return last && last !== 'dashboard' ? last : undefined
})
const { data: metaData } = useDashboardMeta()
const { menuLabel } = useDashboardLabels()
const tableLabel = computed(() => {
  if (!table.value) return null
  const item = metaData.value?.menu?.find(m => m.table === table.value)
  return item ? menuLabel(item) : table.value
})

function closeTab(tab: { path: string }) {
  close(tab.path)
  if (isActive(tab.path, route)) navigateTo('/dashboard')
}
</script>

<template>
  <div class="tabsbar-root shrink-0 bg-background">
    <!-- Tabs (browser-like) -->
    <div class="flex items-end overflow-x-auto px-3 pt-2 no-scrollbar">
      <div
        v-for="(tab, i) in tabs"
        :key="tab.path"
        type="button"
        role="button"
        class="group relative flex shrink-0 cursor-pointer items-center gap-1.5 px-4 pb-2 pt-2.5 text-xs transition-colors tab-item"
        :class="[
          isActive(tab.path, route) ? 'active text-foreground' : 'text-muted hover:bg-muted/60',
          i > 0 ? 'tab-item--divider' : ''
        ]"
        @click="navigateTo(tab.path)"
      >
        <UIcon v-if="tab.icon" :name="tab.icon" class="h-3.5 w-3.5 shrink-0" />
        <span class="whitespace-nowrap">{{ tab.label }}</span>
        <UIcon
          v-if="tab.path !== '/dashboard'"
          name="i-lucide-x"
          class="h-3.5 w-3.5 text-muted hover:text-error"
          @click.stop="closeTab(tab)"
        />
      </div>
    </div>

    <!-- Breadcrumb -->
    <nav class="tabsbar-breadcrumb flex items-center gap-1 px-4 py-1.5 text-sm text-muted">
      <NuxtLink to="/dashboard" class="hover:text-primary">
        {{ t('dashboard.menu.overview') }}
      </NuxtLink>
      <template v-if="tableLabel">
        <UIcon name="i-lucide-chevron-right" class="h-3.5 w-3.5" />
        <span class="text-foreground">{{ tableLabel }}</span>
      </template>
    </nav>
  </div>
</template>

<style scoped>
/* Browser-like tab: trapezoid clip with a bottom notch that "connects" to the content below */
.tabsbar-root {
  border-bottom: 1px solid var(--ui-border-muted);
}
.tabsbar-breadcrumb {
  border-top: 1px solid var(--ui-border-muted);
}
.tab-item {
  clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 14px 100%);
  margin-right: -4px;
  color: var(--ui-text-muted);
}
.tab-item--divider {
  border-left: 1px solid var(--ui-border-muted);
}
.tab-item:not(.active):hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}
.tab-item.active {
  background: color-mix(in oklab, var(--ui-primary) 12%, var(--ui-bg));
  color: var(--ui-primary);
  font-weight: 600;
  box-shadow: 0 -1px 0 var(--ui-border-muted), -1px 0 0 var(--ui-border-muted), 1px 0 0 var(--ui-border-muted);
}
.tab-item.active::before {
  content: '';
  position: absolute;
  left: 14px;
  right: calc(14px - 4px);
  top: 0;
  height: 2px;
  border-radius: 9999px;
  background: var(--ui-primary);
}
</style>