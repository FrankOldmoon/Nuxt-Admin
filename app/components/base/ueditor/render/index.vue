<template>
  <div class="umo-editor-render umo-page-content render" style="width:100%; min-height:30px">
    <div v-if="renderContent" class="umo-editor-content is-readonly" :style="{ lineHeight: defaultLineHeight }"
      :spellcheck="false">
      <div class="umo-editor" contenteditable="false" style="padding: 0px; min-height: 100%;" ref="renderNodeRef">
        <RenderNode :node="renderContent" />
      </div>
    </div>
  </div>
</template>

<script setup>
import RenderNode from './node.vue'
import { useRenderIndex } from './useRenderIndex'

const props = defineProps({
  json: {
    type: [Object, String, Number, Boolean],
    default: () => ({}),
  },
  // 默认行高
  lineHeight: {
    type: [Number, String],
    default: 1.75,
  },
})

const {
  renderNodeRef,
  defaultLineHeight,
  renderContent,
} = useRenderIndex(props, null)
</script>

<style lang="less">
@import './index.less';
</style>
