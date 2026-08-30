<template>
  <div class="umo-node-view" :style="nodeStyle" data-node-view-wrapper="">
    <div ref="containerRef" class="umo-node-container umo-select-outline umo-node-iframe" style="width: 100%">
      <iframe
        :src="attrs.src"
        :style="iframeStyle"
      ></iframe>
      <button
        class="iframe-btn iframe-open-btn"
        :title="'在新标签页打开'"
        @click.stop="openInNewTab"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M10 1.5h4.5V6H13V3.6L7.3 9.3 6.4 8.4L12 2.8H10V1.5zM2 2.5h4.5V4H3.5v9.5H13V10h1.5v4.5H2V2.5z" />
        </svg>
      </button>
      <button
        class="iframe-btn iframe-fullscreen-btn"
        :title="isFullscreen ? '退出全屏' : '全屏'"
        @click.stop="toggleFullscreen"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M6.5 1.5H2v4.5h1.5V3h3V1.5zM13.5 1.5H9.5V3h3v3H14V1.5h-.5zM1.5 9.5V14H6v-1.5H3v-3H1.5zM14 9.5H12.5V13h-3v1.5H14V9.5z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computeAtomNodeStyle } from '../helpers'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})

const containerRef = ref(null)
const isFullscreen = ref(false)

const nodeStyle = computed(() => ({
  display: 'flex',
  ...computeAtomNodeStyle(attrs.value),
}))

const iframeStyle = computed(() => ({
  display: 'block',
  width: '100%',
  height: isFullscreen.value ? '100%' : `${attrs.value.height || 200}px`,
  border: isFullscreen.value ? 'none' : '1px solid #e5e7eb',
  borderRadius: isFullscreen.value ? '0' : '4px',
  backgroundColor: '#fff',
  pointerEvents: 'auto',
}))

function toggleFullscreen() {
  const el = containerRef.value
  if (!el) return
  if (document.fullscreenElement === el) {
    document.exitFullscreen()
    return
  }
  if (document.fullscreenElement) {
    const onExit = () => {
      document.removeEventListener('fullscreenchange', onExit)
      containerRef.value?.requestFullscreen().catch(() => {})
    }
    document.addEventListener('fullscreenchange', onExit)
    document.exitFullscreen()
    return
  }
  el.requestFullscreen().catch(() => {})
}

function openInNewTab() {
  const src = attrs.value.src
  if (!src) return
  window.open(new URL(src, window.location.origin).href, '_blank', 'noopener,noreferrer')
}

function onFullscreenChange() {
  isFullscreen.value = containerRef.value === document.fullscreenElement
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<style scoped>
.umo-node-iframe {
  position: relative;
}

.iframe-btn {
  position: absolute;
  top: 6px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.iframe-open-btn {
  right: 38px;
  opacity: 1;
}

.iframe-fullscreen-btn {
  right: 6px;
}

.umo-node-iframe:hover .iframe-btn {
  opacity: 1;
}

.iframe-btn:hover {
  background: rgba(0, 0, 0, 0.65);
}

.umo-node-iframe:fullscreen {
  background: #fff;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: stretch;
}

.umo-node-iframe:fullscreen iframe {
  width: 100% !important;
  height: 100% !important;
}
</style>
