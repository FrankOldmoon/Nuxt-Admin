<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown'

/**
 * Assistant message body rendered from Markdown. HTML is escaped by the
 * renderer, so `v-html` only ever receives the sanitized Markdown subset.
 */
const props = defineProps<{ content: string }>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <!-- Sanitized by renderMarkdown (raw HTML disabled), hence the v-html warning is expected. -->
  <div
    class="chat-markdown break-words text-sm leading-relaxed text-highlighted"
    v-html="html"
  />
</template>

<style scoped>
.chat-markdown :deep(p) {
  margin: 0.3rem 0;
}
.chat-markdown :deep(p:first-child) {
  margin-top: 0;
}
.chat-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) {
  margin: 0.6rem 0 0.25rem;
  font-weight: 600;
  line-height: 1.35;
}
.chat-markdown :deep(h1) { font-size: 1.05rem; }
.chat-markdown :deep(h2) { font-size: 1rem; }
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) { font-size: 0.95rem; }
.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
  margin: 0.3rem 0;
  padding-left: 1.15rem;
}
.chat-markdown :deep(ul) { list-style: disc; }
.chat-markdown :deep(ol) { list-style: decimal; }
.chat-markdown :deep(li) { margin: 0.1rem 0; }
.chat-markdown :deep(code) {
  padding: 0.1rem 0.3rem;
  border-radius: 0.3rem;
  background: var(--ui-bg-elevated);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
}
.chat-markdown :deep(pre) {
  margin: 0.4rem 0;
  overflow-x: auto;
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated);
  padding: 0.6rem 0.75rem;
}
.chat-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 0.8rem;
}
.chat-markdown :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.chat-markdown :deep(blockquote) {
  margin: 0.4rem 0;
  border-left: 2px solid var(--ui-border);
  padding-left: 0.6rem;
  color: var(--ui-text-muted);
}
.chat-markdown :deep(hr) {
  margin: 0.6rem 0;
  border-color: var(--ui-border);
}
.chat-markdown :deep(strong) { font-weight: 600; }
</style>
