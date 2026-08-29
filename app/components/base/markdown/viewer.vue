<template>
  <div ref="containerRef" class="cherry-viewer" />
</template>

<script setup lang="ts">
/**
 * Cherry Markdown — read-only preview renderer (previewOnly mode).
 * Registered as <BaseMarkdownViewer> via Nuxt file-name convention.
 * No background, no border — pure markdown rendering.
 */
const props = withDefaults(defineProps<{
  source: string
}>(), {
  source: ''
})

const containerRef = ref<HTMLDivElement>()
let Cherry: any = null
let cherry: any = null

async function render() {
  if (!containerRef.value) return
  if (!Cherry) {
    const mod = await import('cherry-markdown')
    Cherry = mod.default
    await import('cherry-markdown/dist/cherry-markdown.css')
  }
  cherry?.destroy()
  cherry = new Cherry({
    el: containerRef.value,
    value: props.source,
    editor: {
      defaultModel: 'previewOnly'
    },
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
  border: none !important;
  padding: 0 !important;
  background: none !important;
  background-color: transparent !important;
}
.cherry-viewer :deep(.cherry) {
  border: none !important;
  box-shadow: none !important;
  background: none !important;
  background-color: transparent !important;
}
</style>