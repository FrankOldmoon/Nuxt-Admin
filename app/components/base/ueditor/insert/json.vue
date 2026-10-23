<template>
    <UModal title="Modal with title" v-model:open="open" fullscreen>
        <template #body>
            <div class="flex flex-col gap-4 p-4">
                <h3 class="text-lg font-semibold">{{ $t('ueditor.json.title') }}</h3>
                <div class="h-[450px]">
                    <BaseMonaco v-model="inputText" language="json" />
                </div>
                <div class="flex justify-end gap-2">
                    <UButton type="primary" @click="insertContent">{{ $t('ueditor.json.insert') }}</UButton>
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

// Read the editor JSON content when opened
const inputText = ref('')
let isApplying = false

watch(open, (val) => {
    if (val) {
        const editor = props.editor?.useEditor()
        if (editor) {
            isApplying = true
            inputText.value = JSON.stringify(editor.getJSON(), null, 2)
            nextTick(() => { isApplying = false })
        }
    }
})

// Sync to content in real time after editing
watch(inputText, (val) => {
    if (isApplying) return
    if (!val.trim()) return
    try {
        const json = JSON.parse(val)
        const editor = props.editor?.useEditor()
        if (editor) {
            editor.chain().setContent(json).run()
        }
    } catch {
        // Skip when JSON is invalid
    }
})

function insertContent() {
    if (!inputText.value.trim()) return
    try {
        const json = JSON.parse(inputText.value)
        const editor = props.editor?.useEditor()
        if (editor) {
            editor.chain().focus().setContent(json).run()
        }
    } catch {
        // Skip when JSON is invalid
    }
    open.value = false
}
</script>
