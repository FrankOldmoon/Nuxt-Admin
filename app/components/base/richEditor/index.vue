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
        <!-- String mode: markdown textarea + top-right rich text modal button + bottom-right preview toggle (preview hidden by default) -->
        <div v-if="!isJson" class="relative space-y-2">
            <div class="relative">
                <UTextarea v-model="model" :rows="3" class="w-full" :placeholder="t('richEditor.placeholder')" />
                <!-- Rich text editing modal -->
                <UButton icon="i-heroicons-book-open" variant="ghost" size="sm"
                    class="absolute top-0 right-0 opacity-50 hover:opacity-100 transition-opacity z-10"
                    :aria-label="t('richEditor.openEditor')" @click="openEditor" />
            </div>
            <!-- Bottom-right preview toggle: click to show the live preview below, click again to hide -->
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
            <!-- Live preview for text mode (shown only after clicking the bottom-right eye button) -->
            <div v-if="showPreview && model" class="relative border rounded-md p-3">
                <BaseUeditorRender :json="model" />
            </div>
        </div>

        <!-- JSON mode: click the whole preview box to open the ueditor rich text editor (no top-right button) -->
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
    // Backward compatibility for old callers (e.g. test.vue); JSON mode now enters editing by clicking the whole preview box, no longer using the top-right toggle button
    allowTextMode: {
        type: Boolean,
        default: true,
    },
})

// Live preview toggle for text mode (hidden by default, shown after clicking the bottom-right eye button)
const showPreview = ref(false)

const { isJson, isModalOpen, editJson, openEditor, saveJson } = useRichEditor(props, model)
</script>
