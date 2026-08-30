<template>
  <ClientOnly>
    <div ref="editorContainer" class="w-full h-full min-h-[400px] border border-default rounded overflow-hidden" />
    <template #fallback>
      <div class="w-full min-h-[400px] flex items-center justify-center text-muted bg-elevated/30 border border-default rounded">
        {{ $t('common.loading') }}
      </div>
    </template>
  </ClientOnly>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'html' },
  theme: { type: String, default: 'vs-dark' },
  readOnly: { type: Boolean, default: false },
  fontSize: { type: Number, default: 14 },
  autoFormat: { type: Boolean, default: true },
  formatOptions: {
    type: Object,
    default: () => ({
      tabSize: 2,
      insertSpaces: true,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
    }),
  },
})

const emit = defineEmits(['update:modelValue', 'editorReady'])

const {
  editorContainer,
  getEditor,
  getMonaco,
  formatCode,
} = useMonacoEditor(
  () => props.modelValue,
  () => props.language,
  () => props.theme,
  () => props.readOnly,
  () => props.fontSize,
  () => props.autoFormat,
  () => props.formatOptions,
  (val) => emit('update:modelValue', val),
  (editor) => emit('editorReady', editor),
)

defineExpose({ getEditor, getMonaco, formatCode })
</script>
