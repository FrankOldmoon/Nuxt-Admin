<template>
    <div class="p-2">
        <Edit v-if="showConfig" :config="config" @update:config="onConfigChange" @close="showConfig = false" />
    </div>
    <!-- 预览/编辑区（始终显示，交互式编辑文件内容） -->
    <div class="vue-node-body">
        <div class="flex" style="min-height: 300px;">
            <!-- 左侧导航 -->
            <div style="width: 220px; border-right: 1px solid #e5e7eb; padding: 8px; overflow-y: auto; max-height: 400px;">
                <UNavigationMenu :items="navItems" orientation="vertical" class="w-full" />
            </div>
            <!-- 右侧内容编辑 -->
            <div style="flex: 1; padding: 12px; min-width: 0; max-height: 400px; overflow: hidden;">
                <div v-if="selectedFile" class="flex flex-col h-full">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                        <UIcon name="i-lucide-file" class="size-4 text-gray-400" />
                        <span class="text-sm font-medium">{{ selectedFile.label }}</span>
                    </div>
                    <div class="flex-1 overflow-auto">
                        <BaseRichEditor v-model="selectedFile.content" />
                    </div>
                </div>
                <div v-else class="flex items-center justify-center h-full text-gray-400 text-sm">
                    {{ t('ueditor.vfilesSelectHint') }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { nodeViewProps } from '@tiptap/vue-3'
import Edit from './edit.vue'
import { useVfilesIndex } from './useVfilesIndex'

const props = defineProps(nodeViewProps)

const { t, showConfig, config, onConfigChange, navItems, selectedFile } = useVfilesIndex(props)
</script>
