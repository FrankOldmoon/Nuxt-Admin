// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    // 层内 pages/layouts/components 沿用层自身命名约定，允许单词文件名
    files: ['extends/*/pages/**/*.vue', 'extends/*/layouts/**/*.vue', 'extends/*/components/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
)
