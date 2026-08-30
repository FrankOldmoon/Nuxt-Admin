<template>
  <p :style="styleStr" :data-word-wrap="dataWordWrap">
    <template v-if="hasContent">
      <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
    </template>
    <br v-else />
  </p>
</template>

<script setup>
import RenderNode from '../node.vue'
import { computeNodeStyle } from '../helpers.js'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
const hasContent = computed(() => content.value.length > 0)

const styleObj = computed(() => computeNodeStyle(props.node))
const styleStr = computed(() => styleObj.value.style || undefined)
const dataWordWrap = computed(() => styleObj.value['data-word-wrap'])
</script>
