<template>
  <div ref="containerRef" class="cherry-editor" :style="{ minHeight: height }" />
</template>

<script setup lang="ts">
/**
 * Cherry Markdown — full editor with toolbar + image upload support.
 * Replaces the old UTextarea for markdown editing.
 * Emits `update:modelValue` on content change.
 */
import Cherry from 'cherry-markdown'
import 'cherry-markdown/dist/cherry-markdown.css'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  height?: string
}>(), {
  modelValue: '',
  placeholder: '',
  height: '400px'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const toast = useToast()
const containerRef = ref<HTMLDivElement>()
let cherry: Cherry | null = null
let isInternalChange = false

// File upload handler for Cherry Markdown
function fileUpload(file: File, callback: (url: string, extra?: Record<string, unknown>) => void) {
  const formData = new FormData()
  formData.append('files', file)
  $fetch<Array<{ path: string }>>('/api/files/upload', {
    method: 'POST',
    body: formData
  }).then((res) => {
    const path = res?.[0]?.path
    if (path) {
      callback(`/api/files/serve/${path}`)
      toast.add({ title: t('dashboard.crud.imageUploaded'), color: 'success' })
    }
  }).catch((e) => {
    toast.add({ title: t('dashboard.crud.uploadFailed'), color: 'error', description: extractErrorMessage(e) })
  })
}

function initCherry() {
  if (!containerRef.value) return
  cherry?.destroy()
  cherry = new Cherry({
    el: containerRef.value,
    value: props.modelValue,
    editorMode: 'edit',
    fileUpload,
    // Callback when content changes
    callback: {
      afterChange: (text: string) => {
        if (!isInternalChange) {
          emit('update:modelValue', text)
        }
      }
    }
  })
}

// Sync external modelValue changes into the editor
watch(() => props.modelValue, (val) => {
  if (cherry && val !== cherry.getMarkdown()) {
    isInternalChange = true
    cherry.setMarkdown(val)
    nextTick(() => { isInternalChange = false })
  }
})

onMounted(() => initCherry())

onUnmounted(() => {
  cherry?.destroy()
  cherry = null
})
</script>

<style scoped>
.cherry-editor :deep(.cherry) {
  border: 1px solid var(--ui-border-muted);
  border-radius: 6px;
}
.cherry-editor :deep(.cherry-editor-body) {
  min-height: inherit;
}
</style>