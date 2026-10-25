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

const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
const isZhTw = computed(() => String(locale.value).toLowerCase().startsWith('zh-tw'))
const isRtl = computed(() => String(locale.value).toLowerCase().startsWith('ar'))

const title = computed(() => {
  const configs = publicConfig.value?.configs ?? {}
  const localized = isZhTw.value
    ? (configs['site.titleZhTw'] || configs['site.titleZh'])
    : isZh.value ? configs['site.titleZh'] : ''
  return localized || configs['site.title'] || (isZh.value ? '办公宝' : 'OfficeBao')
})
const description = computed(() => {
  const configs = publicConfig.value?.configs ?? {}
  const localized = isZhTw.value
    ? (configs['site.descriptionZhTw'] || configs['site.descriptionZh'])
    : isZh.value ? configs['site.descriptionZh'] : ''
  return localized || configs['site.description'] || ''
})

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

// --- Search-engine ownership proofs ---
// Paste the token from Google Search Console / Bing Webmaster Tools / 百度站长
// into System Config. Empty means no tag is rendered.
function verificationToken(key: string): string {
  return (publicConfig.value?.configs?.[key] || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
}

const seoVerification = computed(() => ({
  google: verificationToken('seo.googleSiteVerification'),
  bing: verificationToken('seo.bingSiteVerification'),
  baidu: verificationToken('seo.baiduSiteVerification')
}))

useHead(() => {
  const meta: Array<{ name: string, content: string }> = []
  if (seoVerification.value.google) meta.push({ name: 'google-site-verification', content: seoVerification.value.google })
  if (seoVerification.value.bing) meta.push({ name: 'msvalidate.01', content: seoVerification.value.bing })
  if (seoVerification.value.baidu) meta.push({ name: 'baidu-site-verification', content: seoVerification.value.baidu })
  return { meta }
})

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

useHead(() => ({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    // Use the exact BCP 47 tag so search engines and screen readers know the
    // variant; Arabic flips the whole document to RTL.
    lang: String(locale.value),
    dir: isRtl.value ? 'rtl' : 'ltr'
  }
}))

// Fallbacks for pages that do not call usePageMeta. Per-page Open Graph tags
// live in usePageMeta — a global ogTitle would make every shared link say the
// site name instead of the page title.
useSeoMeta({
  title,
  description
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
