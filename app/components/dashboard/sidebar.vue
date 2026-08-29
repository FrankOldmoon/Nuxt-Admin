<script setup lang="ts">
/**
 * Dashboard sidebar — renders the menu returned by /api/dashboard/meta.
 * - Desktop (md+): full-width aside, always visible.
 * - Mobile (<md): hidden, replaced by a hamburger button that opens a Popover
 *   containing the same menu items.
 * Emits `navigate(table)` so the parent can push `?table=...` to the URL.
 */
import type { DashboardMenuItem } from '~/types/dashboard'

const props = defineProps<{
  items: DashboardMenuItem[]
  activeTable?: string
}>()

const emit = defineEmits<{
  navigate: [table: string]
}>()

const { t } = useI18n()
const { menuLabel } = useDashboardLabels()

const mobileOpen = ref(false)

function go(item: DashboardMenuItem) {
  emit('navigate', item.url || item.table)
  mobileOpen.value = false
}
</script>

<template>
  <!-- ============ Desktop sidebar (md+) ============ -->
  <aside class="hidden md:flex w-64 shrink-0 flex-col gap-1 side-border-r bg-card py-4 px-3 h-[calc(100vh-var(--header-height,0px))] sticky top-[calc(var(--header-height,0px))] overflow-y-auto no-scrollbar">
    <!-- Account block (shared w/ home header): user menu · language · home -->
    <div class="mb-3 px-2 pt-1.5 pb-2 rounded-lg bg-muted/40 border border-default space-y-0.5">
      <AppUserMenu align="end" />
      <div class="flex items-center gap-1 border-t border-default pt-1">
        <AppLanguageSelect show-label />
        <AppHomeButton class="ml-auto" />
      </div>
    </div>
    <router-link to="/dashboard" class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors mb-3" active-class="bg-primary/10">
      <UIcon name="i-lucide-layout-dashboard" class="h-5 w-5" />
      <span class="font-medium">{{ t('dashboard.menu.overview') }}</span>
    </router-link>
    <USeparator class="my-2" />
    <nav class="flex flex-col gap-1">
      <button
        v-for="item in props.items"
        :key="item.table"
        type="button"
        @click="go(item)"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors"
        :class="props.activeTable === item.table ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted text-current'"
      >
        <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
        <span class="truncate">{{ menuLabel(item) }}</span>
      </button>
    </nav>
    <div class="mt-auto pt-4">
      <div class="text-xs text-muted px-3">
        <span>v0.1 · Dashboard</span>
      </div>
    </div>
  </aside>

  <!-- ============ Mobile trigger + Popover (<md) ============ -->
  <UPopover v-model:open="mobileOpen" class="md:hidden">
    <UButton
      icon="i-lucide-menu"
      color="neutral"
      variant="ghost"
      class="fixed bottom-4 left-4 z-50 shadow-lg"
      size="lg"
      :aria-label="t('dashboard.menu.overview')"
    />
    <template #content>
      <nav class="flex w-60 flex-col gap-1 p-3">
        <!-- Account block (shared w/ home header) -->
        <div class="mb-2 rounded-lg bg-muted/40 border border-default p-2 space-y-1">
          <AppUserMenu align="end" />
          <div class="flex items-center gap-1 border-t border-default pt-1">
            <AppLanguageSelect show-label />
            <AppHomeButton class="ml-auto" @click="mobileOpen = false" />
          </div>
        </div>
        <router-link
          to="/dashboard"
          class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors mb-2"
          active-class="bg-primary/10"
          @click="mobileOpen = false"
        >
          <UIcon name="i-lucide-layout-dashboard" class="h-5 w-5" />
          <span class="font-medium">{{ t('dashboard.menu.overview') }}</span>
        </router-link>
        <USeparator class="my-1" />
        <button
          v-for="item in props.items"
          :key="item.table"
          type="button"
          @click="go(item)"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors"
          :class="props.activeTable === item.table ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted text-current'"
        >
          <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span class="truncate">{{ menuLabel(item) }}</span>
        </button>
      </nav>
    </template>
  </UPopover>
</template>

<style scoped>
/* Faint left/right separator lines */
.side-border-r {
  border-right: 1px solid var(--ui-border-muted);
}
</style>
