<template>
    <div class="flex items-center gap-2 mb-2">
        <UButton icon="i-lucide-folder-plus" size="xs" variant="outline" color="neutral"
            :label="t('ueditor.vfilesAddFolder')" @click="addItem('folder')" />
        <UButton icon="i-lucide-file-plus" size="xs" variant="outline" color="neutral"
            :label="t('ueditor.vfilesAddFile')" @click="addItem('file')" />
    </div>
    <div class="flex flex-col gap-1 max-h-96 overflow-y-auto">
        <div v-for="(node, idx) in editItems" :key="node.id"
            :style="{ paddingLeft: node.depth * 16 + 'px' }"
            class="flex items-center gap-1 p-0.5 bg-white rounded">
            <UIcon :name="node.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file'"
                class="text-gray-400 size-4 shrink-0" />
            <UInput v-model="node.label"
                :placeholder="node.type === 'folder' ? t('ueditor.vfilesFolderName') : t('ueditor.vfilesFileName')"
                size="xs" class="flex-1" />
            <UButton v-if="node.type === 'folder'" icon="i-lucide-file-plus" color="neutral" variant="ghost"
                size="2xs" @click="addChild(node, 'file')" />
            <UButton v-if="node.type === 'folder'" icon="i-lucide-folder-plus" color="neutral"
                variant="ghost" size="2xs" @click="addChild(node, 'folder')" />
            <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="2xs"
                :disabled="idx === 0" @click="moveItem(idx, -1)" />
            <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="2xs"
                :disabled="idx === editItems.length - 1" @click="moveItem(idx, 1)" />
            <UButton icon="i-lucide-x" color="error" variant="ghost" size="2xs" @click="removeItem(idx)" />
        </div>
    </div>
    <USeparator class="my-2" />
    <UButton size="xs" color="primary" @click="apply">{{ t('common.save') }}</UButton>
</template>

<script setup>
import { useVfilesEdit } from './useVfilesEdit'

const props = defineProps({
    config: { type: Object, default: () => ({ items: [] }) },
})
const emit = defineEmits(['update:config', 'close'])

const { t, editItems, apply, addItem, addChild, removeItem, moveItem } = useVfilesEdit(props, emit)
</script>
