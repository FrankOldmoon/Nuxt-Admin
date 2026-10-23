import { defineVitestConfig } from '@nuxt/test-utils/config'

// The default project runs pure-function unit tests in the node environment (files under test/** excluding test/nuxt/).
// defineVitestConfig automatically creates an additional project named "nuxt",
// using the Nuxt runtime environment, matching only {test,tests}/nuxt/**.* files (composables / component tests).
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