<template>
  <div
    ref="contentBox"
    class="relative border border-gray-200 rounded-md bg-white overflow-hidden"
  >
    <!-- Fullscreen button in the top-right corner -->
    <button
      @click="toggleFullscreen"
      class="absolute top-2 right-2 text-xs px-2.5 py-1 bg-gray-100 text-green-600 rounded hover:bg-green-200 transition-colors cursor-pointer z-10"
    >
      {{ $t('common.fullscreen') }}
    </button>

    <!--
      The iframe fully isolates user HTML: external CSS does not affect the content, and the content's CSS does not leak out.
      sandbox="allow-scripts" allows scripts to run and interact, but not to access the parent page.
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
/* Container fills the screen in fullscreen */
div:fullscreen {
  background: #fff;
  width: 100vw;
  height: 100vh;
  overflow: auto;
}
</style>
