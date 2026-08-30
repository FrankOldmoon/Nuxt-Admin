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
  // SVG 无固有尺寸：读取编辑器里设置的宽度/高度来渲染，避免被拉伸或默认占满
  if (typeof attrs.value.src === 'string' && /\.svg($|\?)/i.test(attrs.value.src)) {
    if (attrs.value.width) style.width = toPx(attrs.value.width)
    if (attrs.value.height) style.height = toPx(attrs.value.height)
  }
  return style
})

// 数字 → 'px' 字符串；已是带单位（如 50%、10em）则原样保留
function toPx(v) {
  return typeof v === 'number' ? `${v}px` : String(v)
}
</script>
