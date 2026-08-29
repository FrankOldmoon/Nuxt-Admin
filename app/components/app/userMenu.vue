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
  /** Fit content width (compact, wrapped around the button). Default (false)
   *  stretches to fill the parent (used in the dashboard sidebar account card). */
  fit?: boolean
}>(), {
  align: 'start',
  showLabel: true,
  fit: false
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
    :class="fit ? 'inline-block' : 'w-full'"
  >
    <UButton
      :avatar="{ src: avatarSrc, alt: displayName, size: 'sm' }"
      color="neutral"
      variant="ghost"
      :label="showLabel ? displayName : undefined"
      :trailing-icon="showLabel ? 'i-lucide-chevron-down' : undefined"
      :title="displayName"
      :class="fit ? 'inline-flex items-center justify-center px-2.5' : 'w-full justify-center items-center'"
      :aria-label="displayName"
    />
  </UDropdownMenu>
</template>