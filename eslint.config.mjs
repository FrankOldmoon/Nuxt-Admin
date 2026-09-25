// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    // 层内 pages/layouts/components 沿用层自身命名约定，允许单词文件名
    // （`extends/*` 是旧的层目录，`modules/*/app` 是模块目录，两者同样适用）
    files: [
      'extends/*/pages/**/*.vue',
      'extends/*/layouts/**/*.vue',
      'extends/*/components/**/*.vue',
      'modules/*/app/pages/**/*.vue',
      'modules/*/app/layouts/**/*.vue',
      'modules/*/app/components/**/*.vue'
    ],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
)
