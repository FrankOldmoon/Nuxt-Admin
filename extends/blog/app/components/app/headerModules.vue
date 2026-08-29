<script setup lang="ts">
/**
 * Blog module — plain-text entry rendered in the center of the host's
 * `AppHeader` (via the `header-modules` slot). Lives at the same relative
 * path as any host stub would, so Nuxt layer overrides make this the only
 * `AppHeaderModules`, injecting the Blog link without host code changes.
 */
const { t } = useI18n()
</script>

<template>
  <ULink
    to="/blog"
    class="text-sm font-medium text-muted hover:text-primary transition-colors"
  >
    {{ t('blog.title') }}
  </ULink>
</template>