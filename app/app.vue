<script setup lang="ts">
const { locale } = useI18n()
const { fetchUser } = useAuth()

// Register demo field transformers (used by FieldMeta getter/setter keys, e.g.
// templates.price). See app/composables/useFieldTransform.ts for the API.
registerFieldTransform('currency', {
  getter: (v) => (typeof v === 'number' ? `¥${v.toFixed(2)}` : v),
  setter: (v) => (typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : v),
})

// Public site config (site.title / site.description) from the database
const { data: publicConfig } = await usePublicConfig()

const title = computed(() => publicConfig.value?.configs?.['site.title'] || 'Nuxt Admin')
const description = computed(() => publicConfig.value?.configs?.['site.description'] || '')

// Load current user once on app init (SSR + client hydration)
await useAsyncData('auth:user:init', async () => {
  await fetchUser()
  return true
})

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: locale
  }
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <!-- Global ⌘K command palette -->
    <DashboardCommandPalette />
    <!-- Pages are rendered through NuxtLayout: by default the main site header/footer are shown,
         pages can take over the full viewport via definePageMeta({ layout: false }) (e.g. auth, extension module pages) -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
