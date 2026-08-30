<template>
  <div
    :id="attrs.id || undefined"
    class="umo-node-view umo-floating-node"
    data-node-view-wrapper=""
    :style="wrapperStyle"
  >
    <div class="umo-node-container umo-node-text-box">
      <div class="is-draggable" :style="dragerStyle">
        <div class="umo-node-text-box-content" data-node-view-content="" :style="contentStyle">
          <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
        </div>
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

const wrapperStyle = computed(() => ({
  zIndex: 90,
  '--umo-textbox-border-color': attrs.value.borderColor,
  '--umo-textbox-border-width': `${attrs.value.borderWidth}px`,
  '--umo-textbox-border-style': attrs.value.borderStyle,
  '--umo-textbox-background-color': attrs.value.backgroundColor,
}))

const dragerStyle = computed(() => ({
  position: 'absolute',
  left: `${attrs.value.left || 0}px`,
  top: `${attrs.value.top || 0}px`,
  width: `${attrs.value.width || 200}px`,
  height: `${attrs.value.height || 30}px`,
  transform: attrs.value.angle ? `rotate(${attrs.value.angle}deg)` : '',
  backgroundColor: 'var(--umo-textbox-background-color)',
}))

const contentStyle = computed(() => ({
  whiteSpace: 'pre-wrap',
  writingMode: attrs.value.writingMode,
  outline: `${attrs.value.borderStyle || 'solid'} ${attrs.value.borderWidth || 1}px ${attrs.value.borderColor || '#000'}`,
  width: '100%',
  height: '100%',
  padding: '5px',
  boxSizing: 'border-box',
  overflow: 'hidden',
}))
</script>
