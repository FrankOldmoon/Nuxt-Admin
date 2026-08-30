<template>
    <node-view-wrapper class="vue-node-wrapper">
        <div class="vue-node-container" contenteditable="false">
            <!-- 工具栏（仅有 meta.title 时显示） -->
            <div v-if="meta.title" class="vue-node-toolbar">
                <div class="flex items-center">
                    <UIcon v-if="meta.icon" :name="meta.icon" class="text-gray-500" />
                    <span class="text-sm font-medium">{{ meta.title }}</span>
                </div>
                <div class="flex items-center gap-1">
                    <UButton v-if="meta.hasSettings" icon="i-lucide-settings-2" color="neutral" variant="ghost"
                        size="2xs" @click="showConfig = !showConfig" />
                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="2xs"
                        @click="props.deleteNode()" />
                </div>
            </div>

            <!-- 动态加载的组件（自行渲染 config panel + body） -->
            <div v-if="loading" class="vue-node-loading">{{ t('common.loading') }}</div>
            <component v-else-if="comp" :is="comp" v-bind="props" style="width:100%" @init="onInit" />
        </div>
    </node-view-wrapper>
</template>

<script setup>
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { useNodeView } from './useNodeView'

const props = defineProps(nodeViewProps)

const {
    t,
    comp,
    loading,
    showConfig,
    meta,
    onInit,
} = useNodeView(props, null)
</script>

<style>
@import './nodeView.css';
</style>
