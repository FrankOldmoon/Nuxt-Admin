<template>
    <client-only>
        <umo-editor v-bind="options" ref="editorRef" @changed="onChanged" @created="onCreated" @paste="onPaste">
        </umo-editor>
        <div ref="cinsertsWrapper" v-show="cinsertsShown">
            <Cinserts v-if="canInsert" :editor="editorRef" />
        </div>
    </client-only>
</template>

<script setup>
import { UmoEditor } from '@umoteam/editor'
import Cinserts from './cinserts.vue'
import { useUeditorIndex } from './useUeditorIndex'

const json = defineModel()
const props = defineProps({
    saveHandler: {
        type: Function,
        default: null,
    },
    showInsert: {
        type: Boolean,
        default: true,
    },
    pasteable: {
        type: Boolean,
        default: true,
    },
})

const {
    isReadonly,
    canInsert,
    editorRef,
    tiptapEditor,
    cinsertsWrapper,
    cinsertsShown,
    options,
    onCreated,
    onPaste,
    onChanged,
    saveDocument,
} = useUeditorIndex(props, json)

defineExpose({ saveDocument })
</script>
