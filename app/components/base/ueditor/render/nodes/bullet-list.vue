<template>
  <ul :style="`list-style-type: ${listType}`" :data-type="listType">
    <RenderNode
      v-for="(child, i) in content"
      :key="i"
      :node="child"
    />
  </ul>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
const listType = computed(() => attrs.value.listType || 'disc')
</script>
