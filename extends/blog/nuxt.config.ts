/**
 * Independent `blog` module (Nuxt layer), mounted by the host project via
 * `extends: ['./extends/blog']` in the root nuxt.config.ts.
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
      { code: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'zh-TW', name: '繁體中文', file: 'zh-TW.json' },
      { code: 'ja', name: '日本語', file: 'ja.json' },
      { code: 'ko', name: '한국어', file: 'ko.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'es', name: 'Español', file: 'es.json' },
      { code: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'ar', name: 'العربية', file: 'ar.json' }
    ]
  }
})