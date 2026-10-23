<template>
    <UModal title="Modal with title" v-model:open="open"  fullscreen>
        <template #body>
            <div class="flex flex-col gap-4 p-4">
                <h3 class="text-lg font-semibold">{{ $t('ueditor.markdown.title') }}</h3>
                <div class="h-[450px]">
                    <BaseMonaco v-model="inputText" language="markdown" />
                </div>
                <div class="flex justify-end gap-2">
                    <UButton type="primary" @click="insertContent">{{ $t('ueditor.markdown.insert') }}</UButton>
                    <!-- Close button optional: Nuxt UI Modal closes on overlay click or ESC by default -->
                </div>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
    editor: {
        type: Object,
        default: () => { },
    },
})

const open = defineModel({default: false})

const inputText = ref('')

const insertContent = () => {
    if (!inputText.value.trim()) return

    const json = props.editor.useEditor().markdown.parse(inputText.value)
    // console.log({ json })
    props.editor.insertContent(json)
    open.value = false
    inputText.value = ''
}
</script>
