<template>
    <div class="relative w-full">
        <UModal v-model:open="isModalOpen" fullscreen>
            <UButton v-show="false" />
            <template #body>
                <div class="p-6 space-y-4 h-full">
                    <BaseUeditor v-model="editJson" :pasteable="pasteable" />
                    <div class="flex justify-end gap-2">
                        <UButton variant="soft" @click="() => { isModalOpen = false }">{{ t('common.cancel') }}
                        </UButton>
                        <UButton color="primary" @click="saveJson">{{ t('common.save') }}</UButton>
                    </div>
                </div>
            </template>
        </UModal>
        <!-- 字符串模式：3行文本域 + 实时渲染预览 + 右上角半透明书本按钮 -->
        <div v-if="!isJson" class="relative space-y-2">
            <div class="relative">
                <UTextarea v-model="model" :rows="3" class="w-full" :placeholder="t('richEditor.placeholder')" />
                <!-- 富文本编辑弹窗 -->
                <UButton icon="i-heroicons-book-open" variant="ghost" size="sm"
                    class="absolute top-0 right-0 opacity-50 hover:opacity-100 transition-opacity z-10"
                    :aria-label="t('richEditor.openEditor')" @click="openEditor" />
            </div>
            <!-- 文本模式的实时预览：BaseUeditorRender 内部通过 markdownToTiptap 把字符串转 Tiptap JSON 渲染 -->
            <div v-if="model" class="relative border rounded-md p-3">
                <p class="mb-1 text-xs text-muted">{{ t('richEditor.preview') }}</p>
                <BaseUeditorRender :json="model" />
            </div>
        </div>

        <!-- JSON 模式：渲染富文本（可交互） + 右上角编辑按钮（弹 modal 编辑） -->
        <div v-if="isJson" class="relative border rounded-md p-3 min-h-[72px]">
            <BaseUeditorRender :json="model" />
            <div class="absolute top-0 right-0 flex items-center gap-1 z-10">
                <UButton icon="i-heroicons-pencil-square" variant="ghost" size="sm"
                    class="opacity-50 hover:opacity-100 transition-opacity" :aria-label="t('richEditor.openEditor')"
                    @click="openEditor" />
                <UButton v-if="allowTextMode" icon="i-heroicons-book-open" variant="ghost" size="sm"
                    class="opacity-50 hover:opacity-100 transition-opacity" :aria-label="t('richEditor.switchToText')"
                    @click="switchToTextMode" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useRichEditor } from './useRichEditor'

const { t } = useI18n()

const model = defineModel<string | Record<string, any>>({ default: '' })

const props = defineProps({
    pasteable: {
        type: Boolean,
        default: true,
    },
    allowTextMode: {
        type: Boolean,
        default: true,
    },
})

const { isJson, isModalOpen, editJson, openEditor, saveJson, switchToTextMode } = useRichEditor(props, model)
</script>
