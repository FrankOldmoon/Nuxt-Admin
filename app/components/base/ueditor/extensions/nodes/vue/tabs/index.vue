<template>
    <div class="p-2">
        <Edit v-if="showConfig" :config="config" @update:config="onConfigChange" @close="showConfig = false" />
    </div>
    <!-- Preview/edit area (always shown, interactively edit tab content) -->
    <div class="vue-node-body">
        <UTabs :items="tabItems" class="p-3">
            <template #content="{ item }">
                <div style="padding-top: 12px; min-height: 60px;">
                    <BaseRichEditor v-model="item.content" />
                </div>
            </template>
        </UTabs>
    </div>
</template>

<script setup>
import { nodeViewProps } from '@tiptap/vue-3'
import Edit from './edit.vue'

const props = defineProps(nodeViewProps)
const { t } = useI18n()

const showConfig = inject('nodeViewShowConfig')
const meta = inject('nodeViewMeta')

meta.title = t('ueditor.tabs')
meta.icon = 'i-lucide-panel-top'
meta.hasSettings = true

const parseConfig = () => {
    try {
        const raw = props.node.attrs.content
        if (raw) return JSON.parse(raw)
    } catch (_) { /* noop */ }
    return {}
}
const config = ref(parseConfig())

const tabItems = computed(() => config.value.tabs || [{ label: 'Tab 1', content: '' }, { label: 'Tab 2', content: '' }])

function onConfigChange(newConfig) {
    config.value = newConfig
    props.updateAttributes({ content: JSON.stringify(newConfig) })
}

// Auto-save to node attrs when RichEditor content changes (debounced)
let saveTimer = null
watch(tabItems, () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        props.updateAttributes({ content: JSON.stringify(config.value) })
    }, 800)
}, { deep: true })
</script>
