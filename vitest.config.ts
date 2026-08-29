import { defineVitestConfig } from '@nuxt/test-utils/config'

// 默认项目在 node 环境运行纯函数单元测试（test/** 下非 test/nuxt/ 的文件）。
// defineVitestConfig 会自动创建一个名为 "nuxt" 的额外项目，
// 使用 Nuxt 运行时环境，专门匹配 {test,tests}/nuxt/**.* 的文件（composables / 组件测试）。
export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'test/**/*.{test,spec}.{ts,js,mjs}',
      'extends/blog/**/*.{test,spec}.{ts,js,mjs}',
      'modules/*/test/**/*.{test,spec}.{ts,js,mjs}'
    ],
    exclude: ['**/.DS_Store', '**/node_modules/**', '**/.nuxt/**', '**/.output/**'],
    setupFiles: ['test/setup/global.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/**/*.{ts,vue}', 'server/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'test/**',
        'server/database/migrations/**',
        '**/node_modules/**',
        '**/.nuxt/**',
        '**/.output/**'
      ]
    }
  }
})