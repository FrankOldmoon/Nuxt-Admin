/**
 * Independent `blog` module (Nuxt layer), mounted by the host project via
 * `extends: ['./modules/blog']` in the root nuxt.config.ts.
 *
 * This layer owns EVERYTHING blog-related: its pages, server API, database
 * schema/migrations and its own i18n locale files below `./i18n/locales`.
 * It intentionally contains no reference to blog-specific code in the host.
 *
 * The i18n block below tells @nuxtjs/i18n to load this layer's locale files
 * (`./i18n/locales/*.json`) and deep-merge them with the host locales, so the
 * blog tables/labels participate in the shared `dashboard.tables` /
 * `dashboard.fields` translation system.
 */
export default defineNuxtConfig({
  i18n: {
    langDir: 'locales',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'zh', name: '中文', file: 'zh.json' }
    ]
  }
})