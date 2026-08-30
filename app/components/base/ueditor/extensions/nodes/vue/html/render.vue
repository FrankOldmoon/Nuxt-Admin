<template>
  <div
    ref="contentBox"
    class="relative border border-gray-200 rounded-md bg-white overflow-hidden"
  >
    <!-- 右上角全屏按钮 -->
    <button
      @click="toggleFullscreen"
      class="absolute top-2 right-2 text-xs px-2.5 py-1 bg-gray-100 text-green-600 rounded hover:bg-green-200 transition-colors cursor-pointer z-10"
    >
      {{ $t('common.fullscreen') }}
    </button>

    <!--
      iframe 完全隔离用户 HTML：外部 CSS 不影响内容，内容 CSS 也不泄露。
      sandbox="allow-scripts" 允许脚本运行和交互，但不允许访问父页面。
    -->
    <iframe
      :srcdoc="iframeContent"
      sandbox="allow-scripts"
      class="w-full"
      :style="{ height: isFullscreen ? '100vh' : iframeHeight + 'px', border: 0 }"
    />
  </div>
</template>

<script setup>
import { useHtmlRender } from './useHtmlRender'

const props = defineProps({
  node: Object,
})

const { contentBox, iframeHeight, isFullscreen, iframeContent, toggleFullscreen } = useHtmlRender(props)
</script>

<style scoped>
/* 全屏时容器撑满屏幕 */
div:fullscreen {
  background: #fff;
  width: 100vw;
  height: 100vh;
  overflow: auto;
}
</style>
