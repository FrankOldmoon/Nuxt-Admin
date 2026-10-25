// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Optional Nuxt layers are enabled via the environment. Supported sources:
 *
 *  1. Auto-discovery of `modules/` — every sub-folder is mounted as a layer
 *     when its matching `<NAME>_ENABLED=true` switch is set (e.g.
 *     `DOC_ENABLED=true` enables `./modules/doc`). This is the primary way to
 *     toggle extension modules without editing this file.
 *  2. `EXTENDS_MODULES` env var — a space / comma / newline separated list of
 *     layer paths (e.g. `EXTENDS_MODULES="./modules/nav ./modules/doc"`).
 *
 * Upstream defaults (`./extends/blog`) stay hardcoded below.
 */
const ENV_EXTENDS = (process.env.EXTENDS_MODULES || '')
  .split(/[\s,]+/)
  .map(line => line.trim())
  .filter(line => line.startsWith('./') || line.startsWith('~/') || line.startsWith('/'))

// Auto-enable any `modules/<name>` folder whose `<NAME>_ENABLED=true` is set.
const ENABLED_MODULES = (() => {
  const dir = join(process.cwd(), 'modules')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(name => process.env[`${name.toUpperCase()}_ENABLED`] === 'true')
    .map(name => `./modules/${name}`)
})()

export default defineNuxtConfig({
  // Mount the demo blog layer as an independent Nuxt layer. Each extension
  // layer is added the same way: an `./modules/<name>` folder with a matching
  // `<NAME>_ENABLED=true` env switch (or a path in EXTENDS_MODULES) and
  // nothing else in the host codebase.
  extends: [...new Set(['./extends/blog', ...ENV_EXTENDS, ...ENABLED_MODULES])],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/i18n'],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  ui: {
    fonts: false
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    experimental: {
      openAPI: true,
      websocket: true
    },
    compressPublicAssets: true
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
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
    ],
    vueI18n: './i18n.config.ts',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root'
    }
  }
})
