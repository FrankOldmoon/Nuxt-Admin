// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Local-only Nuxt layers (gitignored). Supported sources, in order:
 *
 *  1. `extends.local.txt` — one layer path per line; blank lines and `#`
 *     comments are ignored. Kept for backward compatibility.
 *  2. `EXTENDS_MODULES` env var — a space / comma / newline separated list of
 *     layer paths (e.g. `EXTENDS_MODULES="./modules/nav ./modules/doc"`).
 *  3. Auto-discovery of `modules/` — every sub-folder is mounted as a layer
 *     when its matching `<NAME>_ENABLED=true` switch is set in the environment
 *     (e.g. `DOC_ENABLED=true` enables `./modules/doc`). This is the primary
 *     way to toggle extension modules without editing this file.
 *
 * Upstream defaults (`./extends/blog`) stay hardcoded below.
 */
const LOCAL_EXTENDS_FILE = join(process.cwd(), 'extends.local.txt')

function readLocalExtends(): string[] {
  if (!existsSync(LOCAL_EXTENDS_FILE)) return []
  return readFileSync(LOCAL_EXTENDS_FILE, 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
}

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
  // layer is added the same way: a `./modules/<name>` line in extends.local.txt
  // (or EXTENDS_MODULES, or a `<NAME>_ENABLED=true` env switch) and nothing
  // else in the host codebase.
  extends: [...new Set(['./extends/blog', ...readLocalExtends(), ...ENV_EXTENDS, ...ENABLED_MODULES])],

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
      { code: 'zh', name: '中文', file: 'zh.json' }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root'
    }
  }
})
