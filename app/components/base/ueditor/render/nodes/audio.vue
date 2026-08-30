<template>
  <div class="umo-node-view" :style="nodeStyle" data-node-view-wrapper="">
    <div class="umo-node-container umo-node-audio">
      <audio :src="attrs.src" controls preload="metadata" style="width: 100%; outline: none"></audio>
    </div>
  </div>
</template>

<script setup>
import { computeAtomNodeStyle } from '../helpers'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})

const nodeStyle = computed(() => computeAtomNodeStyle(attrs.value))
</script>
