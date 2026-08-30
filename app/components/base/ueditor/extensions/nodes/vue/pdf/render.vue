<template>
    <div class="pdf-render-container">
        <div v-if="config.url" ref="previewRef" class="pdf-render-preview">
            <div v-for="p in renderedPages" :key="p" class="pdf-page-wrapper">
                <canvas :ref="el => { if (el) canvasRefs[p] = el }" class="pdf-page-canvas" />
                <div :ref="el => { if (el) textLayerRefs[p] = el }" class="pdf-text-layer" />
            </div>
            <div v-if="rendering" class="pdf-loading">
                <UIcon name="i-lucide-loader-2" class="animate-spin" />
                <span class="ml-2 text-sm text-gray-500">{{ t('common.loading') }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { usePdfRender } from './usePdfRender'

const props = defineProps({
    node: Object,
})

const {
    t, config, previewRef, canvasRefs, textLayerRefs, renderedPages, rendering,
} = usePdfRender(props)
</script>

<style scoped>
.pdf-render-container {
    margin: 12px 0;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
}

.pdf-render-preview {
    background: #fff;
}

.pdf-page-wrapper {
    position: relative;
    background: #fff;
}

.pdf-page-canvas {
    display: block;
    width: 100%;
    height: auto;
}

.pdf-text-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    opacity: 0.8;
    line-height: 1;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    z-index: 2;
}

.pdf-text-layer :deep(span) {
    position: absolute;
    white-space: pre;
    color: transparent;
    cursor: text;
    transform-origin: 0% 0%;
}

.pdf-text-layer :deep(::selection) {
    background: rgba(0, 100, 255, 0.3);
}

.pdf-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
}
</style>
