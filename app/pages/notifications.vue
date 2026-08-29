<script setup lang="ts">
/**
 * Standalone notifications page — accessible directly from header / bell
 * dropdown as `/notifications` (default layout: header + content + footer).
 *
 * Admin users can also reach the same UI from inside the dashboard via the
 * `notify` wildcard table route: `/dashboard/notify`.
 */
import NotificationsPageView from '~/components/dashboard/notificationsPage.vue'

definePageMeta({ middleware: 'auth' })
const { t } = useI18n()
useSeoMeta({ title: () => t('notifications.title') })
</script>

<template>
  <NotificationsPageView />
</template>
