<script setup lang="ts">
/**
 * Shared user info + dropdown menu (avatar button → profile / notifications /
 * messages / admin dashboard / logout). Used in the home page header and the
 * dashboard sidebar so both stay in sync.
 */
withDefaults(defineProps<{
  /** Dropdown alignment / anchor */
  align?: 'start' | 'end'
  /** Show the user's name next to the avatar (vs icon-only avatar) */
  showLabel?: boolean
}>(), {
  align: 'start',
  showLabel: true
})

const { t } = useI18n()
const { user, isLoggedIn, isAdmin, logout } = useAuth()

const displayName = computed(() => user.value?.name || user.value?.username || '')
const avatarSrc = computed(() =>
  user.value?.avatarPath ? `/api/files/serve/${user.value.avatarPath}` : undefined
)

const items = computed(() => [
  [
    { label: t('nav.profile'), to: '/profile', icon: 'i-lucide-user-circle' },
    { label: t('nav.notifications'), to: '/notifications', icon: 'i-lucide-bell' },
    { label: t('nav.messages'), to: '/messages', icon: 'i-lucide-message-circle' },
    ...(isAdmin.value
      ? [{ label: 'Admin Dashboard', to: '/dashboard', icon: 'i-lucide-layout-dashboard' }]
      : [])
  ],
  [
    { label: t('auth.logout.title'), icon: 'i-lucide-log-out', onSelect: () => logout() }
  ]
])
</script>

<template>
  <UDropdownMenu
    v-if="isLoggedIn"
    :items="items"
    mode="hover"
    :content="{ align }"
    class="w-full"
  >
    <UButton
      :avatar="{ src: avatarSrc, alt: displayName, size: 'sm' }"
      color="neutral"
      variant="ghost"
      :label="showLabel ? displayName : undefined"
      :trailing-icon="showLabel ? 'i-lucide-chevron-down' : undefined"
      class="w-full justify-start"
    />
  </UDropdownMenu>
</template>