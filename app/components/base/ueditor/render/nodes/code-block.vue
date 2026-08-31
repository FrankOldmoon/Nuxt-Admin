<template>
  <div
    class="cb-wrapper"
    :class="`cb-theme-${theme}`"
  >
    <div class="cb-header">
      <span class="cb-lang">{{ language }}</span>
      <div
        v-if="!hideActions"
        class="flex items-center gap-2"
      >
        <button
          class="cb-copy"
          :class="{ copied }"
          @click="copyCode"
          v-html="copied ? checkIcon : copyIcon"
        />
      </div>
    </div>
    <div class="cb-main">
      <pre class="cb-lines" aria-hidden="true"><span v-for="n in lineCount" :key="n">{{ n }}</span></pre>
      <pre class="cb-code"><code v-html="highlightedHtml" /></pre>
    </div>
  </div>
</template>

<script setup>
import { useCodeBlock } from './useCodeBlock'

const props = defineProps({ node: { type: Object, required: true } })

const { hideActions, language, theme, lineCount, highlightedHtml, copied, copyIcon, checkIcon, copyCode } = useCodeBlock(props)
</script>

<style lang="less" src="./code-block.less"></style>
