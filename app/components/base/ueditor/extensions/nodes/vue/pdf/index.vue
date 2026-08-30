<template>
    <div class="p-2">
        <Edit v-if="showConfig" :config="config" @update:config="onConfigChange" @close="showConfig = false" />
    </div>
    <div class="vue-node-body">
        <div v-if="!config.url" class="flex flex-col items-center justify-center py-10">
            <UIcon name="i-lucide-file-plus" class="size-8 text-gray-300" />
            <p class="text-sm text-gray-400 mt-2">{{ t('ueditor.pdfSelectHint') }}</p>
        </div>
        <Render v-else :node="node" />
    </div>
</template>

<script setup>
import { nodeViewProps } from '@tiptap/vue-3'
import Edit from './edit.vue'
import Render from './render.vue'

const props = defineProps(nodeViewProps)
const { t } = useI18n()

const showConfig = inject('nodeViewShowConfig')
const meta = inject('nodeViewMeta')

meta.icon = 'i-lucide-file-text'
meta.hasSettings = true

const parseConfig = () => {
    try {
        const raw = props.node.attrs.content
        if (raw) return JSON.parse(raw)
    } catch (_) { /* noop */ }
    return {}
}
const config = ref(parseConfig())

meta.title = config.value.name || t('ueditor.pdf')
watch(() => config.value.name, (val) => {
    meta.title = val || t('ueditor.pdf')
})

function onConfigChange(newConfig) {
    config.value = newConfig
    props.updateAttributes({ content: JSON.stringify(newConfig) })
}
</script>
