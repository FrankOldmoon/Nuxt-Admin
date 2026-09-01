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
        <!-- 字符串模式：markdown 文本域 + 右上角富文本弹窗按钮 + 右下角预览开关（默认隐藏 preview） -->
        <div v-if="!isJson" class="relative space-y-2">
            <div class="relative">
                <UTextarea v-model="model" :rows="3" class="w-full" :placeholder="t('richEditor.placeholder')" />
                <!-- 富文本编辑弹窗 -->
                <UButton icon="i-heroicons-book-open" variant="ghost" size="sm"
                    class="absolute top-0 right-0 opacity-50 hover:opacity-100 transition-opacity z-10"
                    :aria-label="t('richEditor.openEditor')" @click="openEditor" />
            </div>
            <!-- 右下角预览开关：点击才弹出下方 live preview，再点隐藏 -->
            <div class="flex justify-end">
                <UButton
                    v-if="model"
                    :icon="showPreview ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                    variant="ghost"
                    size="xs"
                    class="text-muted"
                    :aria-label="t('richEditor.preview')"
                    :title="t('richEditor.preview')"
                    @click="showPreview = !showPreview"
                />
            </div>
            <!-- 文本模式的 live preview（需点击右下角眼睛按钮才显示） -->
            <div v-if="showPreview && model" class="relative border rounded-md p-3">
                <BaseUeditorRender :json="model" />
            </div>
        </div>

        <!-- JSON 模式：点击整个预览框即可打开 ueditor 富文本编辑界面（无右上角按钮） -->
        <div
            v-if="isJson"
            class="relative border rounded-md p-3 min-h-[72px] cursor-pointer"
            :title="t('richEditor.openEditor')"
            @click="openEditor"
        >
            <BaseUeditorRender :json="model" />
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
    // 兼容旧调用方（如 test.vue）；JSON 模式现已改为点击整块预览框进入编辑，不再使用右上角切换按钮
    allowTextMode: {
        type: Boolean,
        default: true,
    },
})

// 文本模式的 live preview 开关（默认隐藏，点击右下角眼睛按钮再显示）
const showPreview = ref(false)

const { isJson, isModalOpen, editJson, openEditor, saveJson } = useRichEditor(props, model)
</script>
