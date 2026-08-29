<template>
  <div ref="containerRef" class="cherry-viewer" />
</template>

<script setup lang="ts">
/**
 * Cherry Markdown — read-only preview renderer.
 * Replaces the old BaseMarkdownViewer.
 */
import Cherry from 'cherry-markdown'
import 'cherry-markdown/dist/cherry-markdown.css'

const props = withDefaults(defineProps<{
  source: string
}>(), {
  source: ''
})

const containerRef = ref<HTMLDivElement>()
let cherry: Cherry | null = null

function render() {
  if (!containerRef.value) return
  cherry?.destroy()
  cherry = new Cherry({
    el: containerRef.value,
    value: props.source,
    editorMode: 'preview',
    // Disable toolbar in preview mode
    toolbars: {}
  })
}

watch(() => props.source, () => render())

onMounted(() => render())

onUnmounted(() => {
  cherry?.destroy()
  cherry = null
})
</script>

<style scoped>
.cherry-viewer :deep(.cherry-previewer) {
  border: none;
  padding: 0;
}
</style>