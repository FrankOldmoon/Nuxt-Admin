<script setup lang="ts">
const { locale } = useI18n()
const { fetchUser } = useAuth()

// Public site config (site.title / site.description) from the database
const { data: publicConfig } = await usePublicConfig()

const title = computed(() => publicConfig.value?.configs?.['site.title'] || 'Nuxt AI')
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
