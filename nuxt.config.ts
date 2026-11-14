// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AVAILABLE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './modules.catalog'

/**
 * Nuxt layers are resolved at build time:
 *
 *  1. Business modules — every ID in `ENABLED_MODULES` must exist in
 *     `modules.catalog.ts`; its `./modules/<id>` folder is mounted as a layer.
 *     Unknown IDs fail the build instead of being ignored.
 *  2. `EXTENDS_MODULES` env var — a space / comma / newline separated list of
 *     layer paths (e.g. `EXTENDS_MODULES="./extends/extra"`).
 *
 * Upstream defaults (`./extends/blog`) stay hardcoded below and can be turned
 * off with `BLOG_ENABLED=false`.
 */
const ENV_EXTENDS = (process.env.EXTENDS_MODULES || '')
  .split(/[\s,]+/)
  .map(line => line.trim())
  .filter(line => line.startsWith('./') || line.startsWith('~/') || line.startsWith('/'))

const ENABLED_MODULE_IDS = new Set(
  (process.env.ENABLED_MODULES ?? DEFAULT_ENABLED_MODULE_IDS.join(','))
    .split(/[\s,]+/)
    .map(id => id.trim())
    .filter(Boolean)
)
const AVAILABLE_IDS = new Set(AVAILABLE_MODULE_IDS)
for (const id of ENABLED_MODULE_IDS) {
  if (!AVAILABLE_IDS.has(id)) throw new Error(`Unknown enabled module: ${id}`)
}

// Nuxt layer inclusion is resolved at build time; runtime toggles cannot unload its routes.
const ENABLED_MODULES = (() => {
  const dir = join(process.cwd(), 'modules')
  const modulePaths = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .filter(d => ENABLED_MODULE_IDS.has(d.name))
        .map(d => `./modules/${d.name}`)
    : []
  return [...new Set([
    ...(process.env.BLOG_ENABLED !== 'false' ? ['./extends/blog'] : []),
    ...ENV_EXTENDS,
    ...modulePaths
  ])]
})()

export default defineNuxtConfig({
  // Mount the blog layer plus every catalog module enabled through
  // `ENABLED_MODULES` (and any extra paths from `EXTENDS_MODULES`).
  extends: [...new Set([...ENV_EXTENDS, ...ENABLED_MODULES])],

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
      websocket: true,
      tasks: true
    },
    // Nitro scheduled tasks (server/tasks/**). Task names use `:` for folders.
    scheduledTasks: {
      // Every day at 01:00 — attendance alert scan.
      '0 1 * * *': ['sms:attendance-scan'],
      // Every Monday at 02:00 — previous week's report.
      '0 2 * * 1': ['sms:weekly-report']
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
    // English keeps unprefixed URLs (`/`, `/edu`); every other locale gets a
    // prefix (`/ja/edu`) so search engines can index each language separately.
    strategy: 'prefix_except_default',
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
