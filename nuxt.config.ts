// https://nuxt.com/docs/api/configuration/nuxt-config
// 前端plugins, utils文件夹里的函数全部自动导入，不要手写 import
// 后端plugins, utils文件夹的函数全部自动导入，不要手写 import
// components 嵌套文件驼峰，子目录名作为标签前缀，直接使用，无需导入。如`components/base/modalConfirm.vue`直接用`<BaseModalConfirm />`, `components/base/index.vue`直接用`<Base/>`
// 每个页面或者组件超过100行时，建议拆分成多个文件，每个文件负责一个功能模块。
export default defineNuxtConfig({
  // Mount the demo blog module as an independent layer. Each future module
  // is added the same way: one `./modules/<name>` line here and nothing else
  // in the host codebase.
  extends: ['./modules/blog'],

  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/i18n'],

  css: ['~/assets/css/main.css'],


  // i18n 文件在项目根下的 i18n/locales（@nuxtjs/i18n 默认相对于 srcDir/i18n/）
  // 所以 langDir='locales'
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
