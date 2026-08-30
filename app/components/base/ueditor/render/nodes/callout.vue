<template>
  <div class="umo-node-view" data-node-view-wrapper="">
    <div
      class="umo-node-container hover-shadow umo-node-callout"
      :style="{ color: attrs.fontColor, backgroundColor: attrs.backgroundColor }"
    >
      <span v-if="attrs.icon" class="umo-node-callout-icon" contenteditable="false">{{ attrs.icon }}</span>
      <div class="umo-node-callout-content" data-node-view-content="" style="white-space: pre-wrap">
        <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
      </div>
    </div>
  </div>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
</script>
