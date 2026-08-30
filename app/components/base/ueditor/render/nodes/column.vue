<template>
  <div class="umo-node-column" :style="`width: ${colWidth}px`">
    <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
  </div>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
const colWidth = computed(() => attrs.value.colWidth || 200)
</script>
