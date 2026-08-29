<script setup lang="ts">
import type { AuthMode } from '~/components/auth/form.vue'

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const { unreadNotifications, unreadMessages } = useWebSocket()

// Site title comes from the configs table (site.title, editable by admin),
// falling back to the i18n translation only when unset.
const { data: publicConfig } = usePublicConfig()
const siteTitle = computed(() => publicConfig.value?.configs?.['site.title'] || t('site.title'))

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

    <!-- Center area: rendered by the header's default slot, geometrically
         centered between the symmetric left/right regions on lg+ screens.
         Extension point for layers (see AppHeaderModules). -->
    <slot name="header-modules">
      <AppHeaderModules />
    </slot>

    <!-- Mobile menu body: shown when tapping the header toggle; re-exposes the
         header-modules (e.g. Blog button) that are hidden by the center on
         small screens. -->
    <template #body>
      <div class="flex flex-col gap-1 p-3">
        <slot name="header-modules">
          <AppHeaderModules />
        </slot>
      </div>
    </template>
  </UHeader>

  <AuthModal
    v-model:open="authModalOpen"
    v-model:mode="authModalMode"
  />
</template>
