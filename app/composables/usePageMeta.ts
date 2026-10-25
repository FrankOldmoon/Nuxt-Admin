/**
 * One call that wires a page's whole head: title, description, robots, Open
 * Graph, Twitter card and canonical.
 *
 * Why a helper instead of `useSeoMeta` per page: the site title, description and
 * share image live in the database (editable in the dashboard), and canonical
 * URLs must be absolute. Doing that by hand on every page is how OG tags ended
 * up stuck on the site name and the canonical link went missing entirely.
 */
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

export interface PageMetaOptions {
  /** Page name without the site suffix; omit to use the site title alone. */
  title?: MaybeRefOrGetter<string | undefined>
  description?: MaybeRefOrGetter<string | undefined>
  /** Absolute URL or a path under the site root. */
  image?: MaybeRefOrGetter<string | undefined>
  type?: 'website' | 'article'
  /** Defaults to the current path; pass '/' to canonicalise duplicate routes. */
  canonicalPath?: MaybeRefOrGetter<string | undefined>
  /** Auth, account and dashboard pages pass `false`. */
  indexable?: MaybeRefOrGetter<boolean | undefined>
}

function absolute(origin: string, value: string): string {
  return /^https?:\/\//i.test(value) ? value : `${origin}${value.startsWith('/') ? '' : '/'}${value}`
}

/** Open Graph locales for the nine UI languages. */
const OG_LOCALES: Record<string, string> = {
  'en': 'en_US',
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW',
  'ja': 'ja_JP',
  'ko': 'ko_KR',
  'fr': 'fr_FR',
  'es': 'es_ES',
  'de': 'de_DE',
  'ar': 'ar_AR'
}

export function usePageMeta(options: PageMetaOptions = {}) {
  const { locale, locales } = useI18n()
  const localePath = useLocalePath()
  const switchLocalePath = useSwitchLocalePath()
  const { data: publicConfig } = usePublicConfig()
  const route = useRoute()
  const requestURL = useRequestURL()

  const configs = computed(() => publicConfig.value?.configs ?? {})
  const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
  const isZhTw = computed(() => String(locale.value).toLowerCase().startsWith('zh-tw'))
  const siteTitle = computed(() => {
    const localized = isZhTw.value
      ? (configs.value['site.titleZhTw'] || configs.value['site.titleZh'])
      : isZh.value ? configs.value['site.titleZh'] : ''
    return localized || configs.value['site.title'] || (isZh.value ? '办公宝' : 'OfficeBao')
  })
  const siteDescription = computed(() => {
    const localized = isZhTw.value
      ? (configs.value['site.descriptionZhTw'] || configs.value['site.descriptionZh'])
      : isZh.value ? configs.value['site.descriptionZh'] : ''
    return localized || configs.value['site.description'] || ''
  })

  const origin = computed(() => {
    const protocol = requestURL.protocol || 'https:'
    return `${protocol}//${requestURL.host}`
  })

  const pageTitle = computed(() => toValue(options.title) || '')
  const title = computed(() => {
    const page = pageTitle.value.trim()
    if (!page) return siteTitle.value
    // Already carries the brand (e.g. "OfficeBao — everyday work tools");
    // appending it again would read "… · OfficeBao · OfficeBao".
    if (page.includes(siteTitle.value)) return page
    return `${page} · ${siteTitle.value}`
  })
  const description = computed(() => toValue(options.description) || siteDescription.value || undefined)

  const canonicalPath = computed(() => toValue(options.canonicalPath))
  const canonical = computed(() => {
    // An explicit path (e.g. `/edu`) is localised for the active language;
    // otherwise `route.path` already carries the locale prefix.
    const path = canonicalPath.value ? localePath(canonicalPath.value) : route.path
    if (/^https?:\/\//i.test(path)) return path
    return absolute(origin.value, path === '/' ? '/' : path.replace(/\/+$/, ''))
  })

  /** hreflang alternates for every UI language, plus x-default. */
  const alternates = computed(() => {
    type LocaleCode = NonNullable<Parameters<typeof localePath>[1]>
    const links: Array<{ rel: 'alternate', hreflang: string, href: string }> = []
    const explicit = canonicalPath.value
    for (const item of locales.value) {
      const code = String(item.code)
      const localeCode = code as LocaleCode
      const path = explicit ? localePath(explicit, localeCode) : switchLocalePath(localeCode)
      if (path) links.push({ rel: 'alternate', hreflang: code, href: absolute(origin.value, path) })
    }
    const xDefault = explicit ? localePath(explicit, 'en') : switchLocalePath('en')
    if (xDefault) links.push({ rel: 'alternate', hreflang: 'x-default', href: absolute(origin.value, xDefault) })
    return links
  })

  const image = computed(() => {
    const raw = toValue(options.image) || configs.value['site.ogImage'] || ''
    return raw ? absolute(origin.value, raw) : undefined
  })

  const robots = computed(() => (toValue(options.indexable) === false
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1'))

  useSeoMeta({
    title: () => title.value,
    description: () => description.value,
    robots: () => robots.value,
    ogTitle: () => title.value,
    ogDescription: () => description.value,
    ogType: options.type ?? 'website',
    ogUrl: () => canonical.value,
    ogSiteName: () => siteTitle.value,
    ogLocale: () => OG_LOCALES[String(locale.value)] || 'en_US',
    ogImage: () => image.value,
    twitterCard: () => (image.value ? 'summary_large_image' : 'summary'),
    twitterTitle: () => title.value,
    twitterDescription: () => description.value,
    twitterImage: () => image.value
  })

  useHead(() => ({
    link: [
      { rel: 'canonical', href: canonical.value },
      ...alternates.value
    ]
  }))

  return { title, description, canonical, image, siteTitle, origin }
}

/**
 * Emit a schema.org JSON-LD block. `<` is escaped so copy coming from the
 * database can never terminate the script tag early.
 */
export function useJsonLd(data: () => Record<string, unknown>) {
  useHead(() => ({
    script: [{
      type: 'application/ld+json',
      innerHTML: JSON.stringify(data()).replace(/</g, '\\u003c')
    }]
  }))
}
