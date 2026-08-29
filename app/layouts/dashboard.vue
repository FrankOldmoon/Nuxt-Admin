<script setup lang="ts">
/**
 * Dashboard layout — wraps every route under `/dashboard/*`.
 *
 * Renders a top bar (breadcrumb + multi-tabs) above the page content.
 * Page-level state caching is handled by the dashboard pages themselves via
 * `definePageMeta({ keepalive: true })` and delegated to NuxtPage (see pages/dashboard/*.vue).
 */
</script>

<template>
  <div class="flex h-[calc(100vh-var(--header-height,0px))] flex-col">
    <div class="min-h-0 flex-1">
      <slot />
    </div>
  </div>
</template>
