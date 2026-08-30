<template>
  <component :is="tag" :id="attrs.id" :style="styleStr" :data-word-wrap="dataWordWrap" class="scroll-mt-20">
    <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
  </component>
</template>

<script setup>
import RenderNode from '../node.vue'
import { computeNodeStyle } from '../helpers.js'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
const tag = computed(() => `h${attrs.value.level || 1}`)

const styleObj = computed(() => computeNodeStyle(props.node))
const styleStr = computed(() => styleObj.value.style || undefined)
const dataWordWrap = computed(() => styleObj.value['data-word-wrap'])
</script>
