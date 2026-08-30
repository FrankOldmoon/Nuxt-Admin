<template>
    <div v-for="(tab, idx) in editTabs" :key="idx" class="flex items-center gap-2">
        <UInput v-model="tab.label" :placeholder="t('ueditor.tabsLabel')" size="sm" class="w-40" />
        <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="editTabs.splice(idx, 1)" />
    </div>
    <UButton icon="i-lucide-plus" color="neutral" variant="outline" size="xs"
        :label="t('ueditor.tabsAdd')" @click="editTabs.push({ label: '', content: '' })" />
    <USeparator />
    <UButton size="xs" color="primary" @click="apply">{{ t('common.save') }}</UButton>
</template>

<script setup>
const props = defineProps({
    config: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:config', 'close'])
const { t } = useI18n()

const editTabs = ref([...(props.config?.tabs || [{ label: 'Tab 1', content: '' }, { label: 'Tab 2', content: '' }])])

function apply() {
    const tabs = editTabs.value.filter(t => t.label.trim())
    const finalTabs = tabs.length ? tabs : [{ label: 'Tab 1', content: '' }]
    emit('update:config', { tabs: finalTabs })
    emit('close')
}
</script>
