<template>
    <div class="flex items-center h-full px-1">
        <UDropdownMenu :items="allItems" :content="{ align: 'start' }">
            <button class="flex flex-col items-center justify-center gap-0.5 px-2 py-1 border-none rounded bg-transparent cursor-pointer text-[13px] text-inherit transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10">
                <UIcon name="i-lucide-plus" class="text-base" />
                <span class="whitespace-nowrap">{{ $t('ueditor.insert') }}</span>
            </button>
        </UDropdownMenu>
    </div>

    <!-- Markdown 弹窗 -->
    <UeditorInsertMarkdown :editor="editor" v-model="markdownOpen" />

    <!-- HTML 弹窗 -->
    <UeditorInsertHtml :editor="editor" v-model="htmlOpen" />

    <!-- JSON 弹窗 -->
    <UeditorInsertJson :editor="editor" v-model="jsonOpen" />
</template>

<script setup>
import { useCinserts } from './useCinserts'

import UeditorInsertMarkdown from './insert/markdown.vue'
import UeditorInsertHtml from './insert/html.vue'
import UeditorInsertJson from './insert/json.vue'

const props = defineProps({
    editor: { type: Object, default: null },
})

const {
    markdownOpen,
    htmlOpen,
    jsonOpen,
    allItems,
} = useCinserts(props, null)
</script>
