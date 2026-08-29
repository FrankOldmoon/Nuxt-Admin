<template>
  <div ref="chartRef" class="w-full" :style="{ height }" />
</template>

<script setup lang="ts">
/**
 * Generic ECharts wrapper — renders a chart in a client-only div.
 * Auto-resizes on container resize.
 */
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

const props = withDefaults(defineProps<{
  option: EChartsOption
  height?: string
}>(), {
  height: '300px'
})

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function initChart() {
  if (!chartRef.value) return
  chart?.dispose()
  chart = echarts.init(chartRef.value)
  chart.setOption(props.option)
}

// Watch option changes
watch(() => props.option, (val) => {
  chart?.setOption(val, { notMerge: true })
}, { deep: true })

onMounted(() => {
  initChart()
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chart?.resize()
    })
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>