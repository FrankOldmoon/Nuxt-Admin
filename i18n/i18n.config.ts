/**
 * vue-i18n options that are not part of the Nuxt module options.
 * `fallbackLocale` makes locales with a partial translation file (for example
 * the admin dashboard, which is English-only outside zh-CN/zh-TW) fall back to
 * English instead of rendering raw message keys.
 */
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: {
    // Traditional Chinese falls back to Simplified before English, so the
    // (English-only) admin and blog copy does not jump to a third language.
    'zh-TW': ['zh-CN', 'en'],
    'default': ['en']
  }
}))
