// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Optional local-only Nuxt layers, read from `extends.local.txt` (gitignored).
// Format: one layer path per line; blank lines and `#` comments are ignored.
// Because the file is NOT tracked by git, downstream users can add their own
// layers here without ever merging with upstream changes to this config file.
// Upstream defaults (`./modules/blog`) stay hardcoded below.
//   e.g.
//   # my private module
//   ./modules/my-layer
const LOCAL_EXTENDS_FILE = join(process.cwd(), 'extends.local.txt')

function readLocalExtends(): string[] {
  if (!existsSync(LOCAL_EXTENDS_FILE)) return []
  return readFileSync(LOCAL_EXTENDS_FILE, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

export default defineNuxtConfig({
  // Mount the demo blog module as an independent layer. Each future module
  // is added the same way: one `./modules/<name>` line here and nothing else
  // in the host codebase.
  extends: ['./modules/blog', ...readLocalExtends()],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/i18n'],

  css: ['~/assets/css/main.css'],

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
  },

  devtools: {
    enabled: true
  },

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
  }
})
