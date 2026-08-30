<template>
    <div class="tabs-render-container">
        <UTabs :items="tabItems">
            <template #content="{ item }">
                <div class="tabs-render-content">
                    <BaseUeditorRender :json="item.content" />
                </div>
            </template>
        </UTabs>
    </div>
</template>

<script setup>
const props = defineProps({
    node: Object,
})

const config = computed(() => {
    try {
        const raw = props.node?.attrs?.content
        if (raw) return JSON.parse(raw)
    } catch (_) { /* noop */ }
    return {}
})

const tabItems = computed(() => {
    const tabs = config.value.tabs || [{ label: 'Tab 1', content: '' }, { label: 'Tab 2', content: '' }]
    return tabs.map(tab => ({
        label: tab.label || 'Tab',
        content: tab.content || '',
    }))
})
</script>

<style scoped>
.tabs-render-container {
    margin: 12px 0;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
}
.tabs-render-content {
    padding: 12px 0;
    min-height: 60px;
}
</style>
