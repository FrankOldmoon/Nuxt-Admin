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

// --- Analytics / tracking (configured in dashboard configs, empty = disabled) ---
// Google Analytics 4 + Google Ads share the same gtag.js loader; Baidu Tongji (百度统计)
// gets its own hm.js script. IDs are sanitized so the inline snippet cannot be injected.
const googleAnalyticsId = computed(() =>
  (publicConfig.value?.configs?.['analytics.googleAnalyticsId'] || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
)
const googleAdsId = computed(() =>
  (publicConfig.value?.configs?.['analytics.googleAdsId'] || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
)
const baiduTongjiId = computed(() =>
  (publicConfig.value?.configs?.['analytics.baiduTongjiId'] || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
)

useHead(() => {
  const googleIds = [googleAnalyticsId.value, googleAdsId.value].filter(Boolean)

  const scripts: Array<Record<string, unknown>> = []
  if (googleIds.length > 0) {
    scripts.push({
      src: `https://www.googletagmanager.com/gtag/js?id=${googleIds[0]}`,
      async: true
    })
    scripts.push({
      innerHTML:
        `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}`
        + `gtag('js',new Date());`
        + googleIds.map(id => `gtag('config','${id}')`).join(';')
    })
  }
  if (baiduTongjiId.value) {
    scripts.push({
      src: `https://hm.baidu.com/hm.js?${baiduTongjiId.value}`,
      async: true
    })
  }
  return { script: scripts }
})

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
