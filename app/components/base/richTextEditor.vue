<script setup lang="ts">
/**
 * Lightweight rich text editor (v-model bound to an HTML string).
 * Based on contenteditable + native execCommand, no third-party dependencies,
 * usable as an optional rich text rendering for textarea fields.
 */
const props = defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { t } = useI18n()
const editorRef = ref<HTMLElement | null>(null)

// Replace the selection with a piece of HTML (keeps the caret)
function exec(cmd: string, value?: string) {
  editorRef.value?.focus()
  document.execCommand(cmd, false, value)
  sync()
}
function sync() {
  if (editorRef.value) emit('update:modelValue', editorRef.value.innerHTML)
}
function applyLink() {
  const url = window.prompt('URL', 'https://')
  if (url) exec('createLink', url)
}
function insertImage() {
  const url = window.prompt('URL')
  if (url) exec('insertImage', url)
}

// Write back the editor from the external value (e.g. on init)
watch(() => props.modelValue, (v) => {
  if (editorRef.value && editorRef.value.innerHTML !== (v ?? '')) {
    editorRef.value.innerHTML = v ?? ''
  }
})

onMounted(() => { if (editorRef.value) editorRef.value.innerHTML = props.modelValue ?? '' })
</script>

<template>
  <div class="w-full overflow-hidden rounded border border-default">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-0.5 border-b border-default bg-muted/30 px-1 py-1">
      <button type="button" class="tool-btn" @click="exec('bold')"><b>B</b></button>
      <button type="button" class="tool-btn italic" @click="exec('italic')"><i>I</i></button>
      <button type="button" class="tool-btn underline" @click="exec('underline')"><u>U</u></button>
      <span class="mx-1 text-muted/40">|</span>
      <button type="button" class="tool-btn" @click="exec('formatBlock', '<p>')">¶</button>
      <button type="button" class="tool-btn" @click="exec('insertUnorderedList')">• List</button>
      <button type="button" class="tool-btn" @click="exec('insertOrderedList')">1. List</button>
      <span class="mx-1 text-muted/40">|</span>
      <button type="button" class="tool-btn" @click="applyLink">Link</button>
      <button type="button" class="tool-btn" @click="insertImage">Img</button>
      <span class="mx-1 flex-1" />
      <span class="px-1 text-[10px] text-muted">{{ t('dashboard.crud.richtextHint') }}</span>
    </div>
    <!-- Editing area -->
    <div
      ref="editorRef"
      contenteditable="true"
      class="min-h-[120px] max-h-80 overflow-auto px-3 py-2 text-sm outline-none"
      :data-placeholder="placeholder"
      @input="sync"
      @blur="sync"
    />
  </div>
</template>

<style scoped>
.tool-btn {
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: inherit;
}
.tool-btn:hover { background: var(--ui-bg-muted); }
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  color: var(--ui-color-muted);
}
</style>