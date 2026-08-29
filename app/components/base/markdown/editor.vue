<template>
  <!-- Normal mode: in-place rendering -->
  <div class="relative w-full editor-wrapper">
    <div ref="containerRef" class="cherry-editor w-full" :style="{ minHeight: height }" />
    <UButton
      icon="i-lucide-maximize"
      color="neutral"
      variant="ghost"
      size="sm"
      class="absolute right-2 top-2 z-10"
      :title="t('common.fullscreen')"
      @click="modalOpen = true"
    />
  </div>

  <!-- Fullscreen modal -->
  <UModal v-model:open="modalOpen" fullscreen>
    <template #body>
      <div class="flex h-full flex-col">
        <div ref="modalContainerRef" class="flex-1 min-h-0" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * Cherry Markdown — editor with image upload support.
 * Default mode: editOnly + no toolbar (plain text editor).
 * Fullscreen modal: edit&preview (dual-column) + full toolbar.
 * Emits `update:modelValue` on content change.
 */
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
const modalContainerRef = ref<HTMLDivElement>()
const modalOpen = ref(false)
let Cherry: any = null
let cherry: any = null
let cherryModal: any = null
let isInternalChange = false

// Full default toolbar items for fullscreen mode
const fullToolbar = [
  'bold', 'italic', 'strikethrough', '|', 'color', 'header', '|', 'list',
  { insert: ['image', 'audio', 'video', 'link', 'hr', 'br', 'code', 'formula', 'toc', 'table', 'line-table', 'bar-table', 'pdf', 'word'] },
  'graph', 'settings'
]
const fullToolbarRight = ['fullScreen', 'togglePreview', 'export', 'wordCount']
const fullBubble = ['bold', 'italic', 'underline', 'strikethrough', 'sub', 'sup', '|', 'size', 'color']
const fullFloat = ['h1', 'h2', 'h3', '|', 'checklist', 'quote', 'quickTable', 'code']

// File upload handler for Cherry Markdown
function fileUpload(file: File, callback: (url: string, extra?: Record<string, unknown>) => void) {
  const formData = new FormData()
  formData.append('files', file)
  $fetch('/api/files/upload', {
    method: 'POST',
    body: formData
  }).then((res: any) => {
    const path = res?.files?.[0]?.path
    if (path) {
      callback(`/api/files/serve/${path}`, { name: file.name })
      toast.add({ title: t('dashboard.crud.imageUploaded'), color: 'success' })
    }
  }).catch((e) => {
    toast.add({ title: t('dashboard.crud.uploadFailed'), color: 'error', description: extractErrorMessage(e) })
  })
}

async function initCherry() {
  if (!containerRef.value) return
  if (!Cherry) {
    const mod = await import('cherry-markdown')
    Cherry = mod.default
    await import('cherry-markdown/dist/cherry-markdown.css')
  }
  cherry?.destroy()
  cherry = new Cherry({
    el: containerRef.value,
    value: props.modelValue,
    editor: {
      defaultModel: 'editOnly'
    },
    toolbars: {
      toolbar: false,
      bubble: false,
      float: false
    },
    callback: {
      fileUpload,
      afterChange: (text: string) => {
        if (!isInternalChange) {
          emit('update:modelValue', text)
        }
      }
    }
  })
}

async function initModalCherry() {
  if (!modalContainerRef.value) return
  if (!Cherry) {
    const mod = await import('cherry-markdown')
    Cherry = mod.default
    await import('cherry-markdown/dist/cherry-markdown.css')
  }
  cherryModal?.destroy()
  cherryModal = new Cherry({
    el: modalContainerRef.value,
    value: props.modelValue,
    editor: {
      defaultModel: 'edit&preview'
    },
    toolbars: {
      toolbar: fullToolbar,
      toolbarRight: fullToolbarRight,
      bubble: fullBubble,
      float: fullFloat
    },
    callback: {
      fileUpload,
      afterChange: (text: string) => {
        if (!isInternalChange) {
          emit('update:modelValue', text)
        }
      }
    }
  })
}

// Watch modal open/close — wait for DOM to render
watch(modalOpen, async (open) => {
  if (open) {
    // Retry a few times in case the modal DOM isn't ready yet
    for (let i = 0; i < 5; i++) {
      await nextTick()
      if (modalContainerRef.value) break
    }
    await initModalCherry()
  } else {
    cherryModal?.destroy()
    cherryModal = null
  }
})

onMounted(() => {
  initCherry()
})

onUnmounted(() => {
  cherry?.destroy()
  cherry = null
  cherryModal?.destroy()
  cherryModal = null
})

// Sync external modelValue changes into the editor
watch(() => props.modelValue, (val) => {
  if (cherry && val !== cherry.getMarkdown()) {
    isInternalChange = true
    cherry.setMarkdown(val)
    nextTick(() => { isInternalChange = false })
  }
  // Also sync to modal if open
  if (cherryModal && val !== cherryModal.getMarkdown()) {
    isInternalChange = true
    cherryModal.setMarkdown(val)
    nextTick(() => { isInternalChange = false })
  }
})
</script>

<style scoped>
.editor-wrapper {
  width: 100%;
  min-width: 0;
}
.cherry-editor {
  width: 100% !important;
}
.cherry-editor :deep(.cherry) {
  width: 100% !important;
  border: 1px solid var(--ui-border-muted);
  border-radius: 6px;
}
.cherry-editor :deep(.cherry-editor-body) {
  min-height: inherit;
}
</style>