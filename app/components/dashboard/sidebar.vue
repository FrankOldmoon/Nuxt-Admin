<script setup lang="ts">
/**
 * Dashboard sidebar — renders the menu returned by /api/dashboard/meta
 * using a vertical UNavigationMenu (supports nested children via parentId).
 * - Desktop (md+): full-width aside, always visible.
 * - Mobile (<md): hidden, replaced by a hamburger button that opens a Popover
 *   containing the same menu items.
 * Emits `navigate(url)` so the parent can push the URL.
 */
import type { DashboardMenuItem } from '~/types/dashboard'
import type { NavigationMenuItem } from '@nuxt/ui'

const props = defineProps<{
  items: DashboardMenuItem[]
  activeTable?: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

const { t } = useI18n()
const { menuLabel } = useDashboardLabels()

const mobileOpen = ref(false)

// Convert flat menu items into nested structure for UNavigationMenu.
// parentId stores the parent item's url; build children lists accordingly.
const menuItems = computed<NavigationMenuItem[]>(() => {
  const visible = props.items.filter(i => !i.hidden)
  const urlOf = (item: DashboardMenuItem) => item.url || `/dashboard/${item.table}`

  const childrenOf = new Map<string, NavigationMenuItem[]>()
  const roots: NavigationMenuItem[] = []
  const nodeOf = (item: DashboardMenuItem): NavigationMenuItem => ({
    label: menuLabel(item),
    icon: item.icon,
    to: urlOf(item),
    active: props.activeTable === item.table,
  })

  for (const item of visible) {
    const node = nodeOf(item)
    const parentUrl = item.parentId
    if (parentUrl && visible.some(v => urlOf(v) === parentUrl)) {
      const arr = childrenOf.get(parentUrl) ?? []
      arr.push(node)
      childrenOf.set(parentUrl, arr)
    } else {
      roots.push(node)
    }
  }

  // Attach children to parents by their url
  const attachByUrl = new Map<string, NavigationMenuItem>()
  const collect = () => {
    attachByUrl.clear()
    const walk = (nodes: NavigationMenuItem[]) => {
      for (const n of nodes) {
        attachByUrl.set(n.to as string, n)
        if (n.children) walk(n.children)
      }
    }
    walk(roots)
  }
  collect()
  const attach = (node: NavigationMenuItem, depth: number) => {
    if (depth > 10) return
    const children = childrenOf.get(node.to as string)
    if (children?.length) node.children = children
  }
  const walk = (nodes: NavigationMenuItem[], depth: number) => {
    for (const n of nodes) {
      attach(n, depth)
      if (n.children) walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return roots
})
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
    <UNavigationMenu
      v-if="menuItems.length"
      :items="menuItems"
      orientation="vertical"
      class="w-full"
    />
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
        <UNavigationMenu
          v-if="menuItems.length"
          :items="menuItems"
          orientation="vertical"
          class="w-full"
        />
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
