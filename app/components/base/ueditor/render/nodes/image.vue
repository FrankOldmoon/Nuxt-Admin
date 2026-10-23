<template>
  <div
    :class="['umo-node-view', { 'is-inline-image': attrs.inline, 'umo-floating-node': attrs.draggable }]"
    :style="wrapperStyle"
    data-node-view-wrapper=""
  >
    <div class="umo-node-container umo-node-image umo-select-outline">
      <img
        v-if="attrs.src"
        :src="attrs.src"
        :style="imgStyle"
        :data-id="attrs.id || undefined"
        :data-preview="attrs.previewType || undefined"
        loading="lazy"
      />
    </div>
  </div>
</template>

<script setup>
import { computeAtomNodeStyle } from '../helpers'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})

const wrapperStyle = computed(() => ({
  display: attrs.value.inline ? 'inline-block' : 'flex',
  ...computeAtomNodeStyle(attrs.value),
}))

const imgStyle = computed(() => {
  const style = {}
  if (attrs.value.flipX || attrs.value.flipY) {
    style.transform = `rotateX(${attrs.value.flipX ? '180' : '0'}deg) rotateY(${attrs.value.flipY ? '180' : '0'}deg)`
  }
  // SVG has no intrinsic size: use the width/height set in the editor for rendering, to avoid stretching or filling by default
  if (typeof attrs.value.src === 'string' && /\.svg($|\?)/i.test(attrs.value.src)) {
    if (attrs.value.width) style.width = toPx(attrs.value.width)
    if (attrs.value.height) style.height = toPx(attrs.value.height)
  }
  return style
})

// Number -> 'px' string; values that already have a unit (e.g. 50%, 10em) are kept as-is
function toPx(v) {
  return typeof v === 'number' ? `${v}px` : String(v)
}
</script>
