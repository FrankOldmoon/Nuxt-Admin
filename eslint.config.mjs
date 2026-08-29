// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    // 模块内 pages/layouts/components 沿用模块自身命名约定，允许单词文件名
    files: ['modules/*/pages/**/*.vue', 'modules/*/layouts/**/*.vue', 'modules/*/components/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  }
)
