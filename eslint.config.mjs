// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    // pages/layouts/components inside layers follow the layer's own naming conventions, allowing single-word filenames
    // (`extends/*` are the old layer directories, `modules/*/app` are module directories; both apply the same way)
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
