<template>
  <div class="cb-wrapper">
    <div class="cb-header">
      <span class="cb-lang">{{ language }}</span>
      <button class="cb-copy" :class="{ copied }" @click="copyCode" v-html="copied ? checkIcon : copyIcon"></button>
    </div>
    <pre class="cb-code"><code v-html="highlightedHtml"></code></pre>
  </div>
</template>

<script setup>
import hljs from 'highlight.js'

const props = defineProps({ node: { type: Object, required: true } })

const attrs = computed(() => props.node.attrs || {})
const language = computed(() => attrs.value.language || 'text')
const codeText = computed(() => {
  const content = props.node.content || []
  return content.map(c => c.text || '').join('')
})

const highlightedHtml = computed(() => {
  const code = codeText.value
  if (!code) return ''
  try {
    if (language.value && language.value !== 'text' && hljs.getLanguage(language.value)) {
      return hljs.highlight(code, { language: language.value }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    return escapeHtml(code)
  }
})

const copied = ref(false)
const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'

function copyCode() {
  if (!navigator.clipboard) return
  navigator.clipboard.writeText(codeText.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
</script>

<style scoped>
.cb-wrapper {
  margin: 12px 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.cb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.cb-lang {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
}
.cb-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}
.cb-copy:hover {
  background: #f3f4f6;
  color: #111827;
}
.cb-copy.copied {
  color: #16a34a;
}
.cb-code {
  margin: 0;
  padding: 12px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
}
.dark .cb-wrapper {
  background: #111827;
  border-color: #374151;
}
.dark .cb-header {
  background: #1f2937;
  border-bottom-color: #374151;
}
.dark .cb-lang {
  color: #9ca3af;
}
.dark .cb-copy {
  color: #9ca3af;
}
.dark .cb-copy:hover {
  background: #374151;
  color: #f9fafb;
}
</style>
