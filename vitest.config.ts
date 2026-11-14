import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineVitestConfig } from '@nuxt/test-utils/config'

// `modules/tools` is an optional, independently cloned Nuxt layer (see .gitignore).
// Its tests live in this repo, so only run them when the layer is present.
const hasToolsModule = existsSync(resolve(process.cwd(), 'modules/tools'))

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
    exclude: [
      '**/.DS_Store',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      ...(hasToolsModule
        ? []
        : [
            'test/unit/app/chatTools.test.ts',
            'test/unit/app/chatUi.test.ts',
            'test/unit/modules/tools/**'
          ])
    ],
    setupFiles: ['test/setup/global.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/**/*.{ts,vue}', 'server/**/*.ts', 'modules/sms/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'test/**',
        'modules/sms/test/**',
        'server/database/migrations/**',
        '**/node_modules/**',
        '**/.nuxt/**',
        '**/.output/**'
      ],
      // SMS 是本仓库增长最快的模块。先以当前可稳定达到的 25% 行覆盖作为
      // 回归底线（防倒退），目标逐步提高到 60%。
      thresholds: {
        'modules/sms/**/*.ts': { lines: 25 }
      }
    }
  }
})
