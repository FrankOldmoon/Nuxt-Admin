<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AuthMode } from '~/components/auth/form.vue'

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const { unreadNotifications, unreadMessages } = useWebSocket()

// Site title comes from the configs table (site.title, editable by admin),
// falling back to the i18n translation only when unset.
const { data: publicConfig } = usePublicConfig()
const siteTitle = computed(() => publicConfig.value?.configs?.['site.title'] || t('site.title'))

// Header navigation links from site.navigation config
interface HeaderNavItem {
  label: string
  url: string
  icon?: string
  order?: number
  hidden?: boolean
  parentId?: string | null
}
const navItems = computed<HeaderNavItem[]>(() => {
  const raw = publicConfig.value?.configs?.['site.navigation']
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as HeaderNavItem[] : []
  } catch {
    return []
  }
})

// Convert flat stored items into the nested structure UNavigationMenu expects.
// parentId stores the parent item's label; build children lists accordingly.
const menuItems = computed<NavigationMenuItem[]>(() => {
  const visible = navItems.value.filter(i => !i.hidden)
  const byLabel = new Map<string, HeaderNavItem>()
  for (const item of visible) byLabel.set(item.label, item)

  const childrenOf = new Map<string, NavigationMenuItem[]>()
  const roots: NavigationMenuItem[] = []

  const nodeOf = (item: HeaderNavItem): NavigationMenuItem => ({
    label: item.label,
    icon: item.icon,
    to: item.url,
    description: (item as any).description,
  })

  for (const item of visible) {
    const node = nodeOf(item)
    if (item.parentId && byLabel.has(item.parentId)) {
      const arr = childrenOf.get(item.parentId) ?? []
      arr.push(node)
      childrenOf.set(item.parentId, arr)
    } else {
      roots.push(node)
    }
  }

  // Attach children to parents (skip cycles by limiting depth)
  const attach = (node: NavigationMenuItem, depth: number) => {
    if (depth > 10) return
    const children = childrenOf.get(node.label)
    if (children?.length) {
      node.children = children
      // A parent (category) only expands its dropdown — it is not a link.
      if (node.children?.length) delete node.to
    }
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

const authModalOpen = ref(false)
const authModalMode = ref<AuthMode>('login')

function openAuth(mode: AuthMode = 'login') {
  authModalMode.value = mode
  authModalOpen.value = true
}
</script>

<template>
  <UHeader>
    <template #left>
      <NuxtLink
        to="/"
        class="flex items-center gap-2"
      >
        <AppLogo class="h-6 w-auto" />
        <span class="font-bold text-highlighted">{{ siteTitle }}</span>
      </NuxtLink>

      <AppLanguageSelect />
    </template>

    <template #right>
      <UColorModeButton />

      <template v-if="isLoggedIn">
        <UButton
          to="/notifications"
          icon="i-lucide-bell"
          color="neutral"
          variant="ghost"
          class="relative"
          :aria-label="t('nav.notifications')"
        >
          <template v-if="unreadNotifications > 0">
            <UBadge
              color="error"
              size="sm"
              :label="String(unreadNotifications > 99 ? '99+' : unreadNotifications)"
              class="absolute -right-1 -top-1"
            />
          </template>
        </UButton>

        <UButton
          to="/messages"
          icon="i-lucide-message-circle"
          color="neutral"
          variant="ghost"
          class="relative"
          :aria-label="t('nav.messages')"
        >
          <template v-if="unreadMessages > 0">
            <UBadge
              color="error"
              size="sm"
              :label="String(unreadMessages > 99 ? '99+' : unreadMessages)"
              class="absolute -right-1 -top-1"
            />
          </template>
        </UButton>

        <!-- Compact: still shows avatar + name, but wraps its own width
             instead of stretching across the header -->
        <AppUserMenu align="end" fit />
      </template>

      <template v-else>
        <UButton
          :label="t('auth.login.title')"
          icon="i-lucide-log-in"
          color="primary"
          variant="soft"
          @click="openAuth('login')"
        />
      </template>

      <UButton
        to="https://github.com/FrankOldmoon/Nuxt-Admin"
        target="_blank"
        icon="i-simple-icons-github"
        aria-label="GitHub"
        color="neutral"
        variant="ghost"
      />
    </template>

    <!-- Center area: navigation menu from site.navigation config -->
    <UNavigationMenu
      v-if="menuItems.length"
      :items="menuItems"
      content-orientation="vertical"
      :ui="{
        content: 'w-72',
        viewport: 'w-72',
      }"
      class="hidden lg:flex"
    />

    <!-- Mobile menu body: re-exposes the nav links hidden on small screens -->
    <template #body>
      <div class="flex flex-col gap-1 p-3">
        <ULink
          v-for="item in navItems.filter(i => !i.hidden)"
          :key="item.label + item.url"
          :to="item.url"
          class="px-3 py-2 rounded-md text-sm font-medium text-muted hover:text-primary hover:bg-muted/50 transition-colors"
        >
          <span v-if="item.icon" class="inline-flex items-center gap-1.5">
            <UIcon :name="item.icon" class="size-4 shrink-0" />
            {{ item.label }}
          </span>
          <template v-else>{{ item.label }}</template>
        </ULink>
      </div>
    </template>
  </UHeader>

  <AuthModal
    v-model:open="authModalOpen"
    v-model:mode="authModalMode"
  />
</template>
