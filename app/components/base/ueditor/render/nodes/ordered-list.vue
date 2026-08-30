<template>
  <ol
    :style="listType !== 'decimal' ? `list-style-type: ${listType}` : undefined"
    :data-type="listType"
    :data-start="startAttr"
  >
    <RenderNode
      v-for="(child, i) in content"
      :key="i"
      :node="child"
    />
  </ol>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
const listType = computed(() => attrs.value.listType || 'decimal')
const startAttr = computed(() =>
  attrs.value.start && attrs.value.start !== 1 ? attrs.value.start : undefined,
)
</script>
