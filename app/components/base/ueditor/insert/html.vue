<template>
    <UModal title="Modal with title" v-model:open="open" fullscreen>
        <template #body>
            <div class="flex flex-col gap-4 p-4">
                <h3 class="text-lg font-semibold">{{ $t('ueditor.html.title') }}</h3>
                <div class="h-[450px]">
                    <BaseMonaco v-model="inputText" language="html" />
                </div>
                <div class="flex justify-end gap-2">
                    <UButton type="primary" @click="insertContent">{{ $t('ueditor.html.insert') }}</UButton>
                </div>
            </div>
        </template>
    </UModal>
</template>

<script setup>
const props = defineProps({
    editor: {
        type: Object,
        default: () => { },
    },
})

const open = defineModel({ default: false })

// 打开时获取当前编辑器 HTML 内容
const inputText = ref('')
watch(open, (val) => {
    if (val) {
        const editor = props.editor?.useEditor()
        if (editor) {
            inputText.value = editor.getHTML()
        }
    }
})

const insertContent = () => {
    if (!inputText.value.trim()) return
    const editor = props.editor?.useEditor()
    if (editor) {
        editor.chain().focus().setContent(inputText.value).run()
    }
    open.value = false
    inputText.value = ''
}
</script>
